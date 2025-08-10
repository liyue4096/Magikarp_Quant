from quart import Quart, render_template
import socketio
from polygon import WebSocketClient
from polygon.websocket.models import WebSocketMessage
import threading
import uvicorn
import os

from src.time_utils import to_iso_utc, to_iso_et


# 创建 Quart 应用实例
app = Quart(__name__)
# TODO: 环境变量export出一个安全的secret key
app.config["SECRET_KEY"] = "secret!"
# 初始化 SocketIO 服务端，与前端网页交互
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, app)

# 对外的 WebSocket 客户端，连向 Polygon.io 的服务器
# ws_clients: dict[str, WebSocketClient] = {}
# ws_threads: dict[str, threading.Thread] = {}
# current_subs: dict[str, list[str]] = {}
ws_client = None
ws_thread = None
current_subs: list[str] = []

API_KEY = "123"


async def _emit_polygon_data(data, sid):
    # await sio.emit("polygon_data", data, to=sid)
    await sio.emit("polygon_data", data)


# 返回当前订阅的 REST 接口
@app.get("/api/subs")
async def get_subs():
    # Quart 自带 jsonify
    return {"subs": current_subs}


def polygon_thread(sid: str, subs: list[str]):
    global ws_client, current_subs

    # 回调：收到 Polygon 的消息后，广播给所有前端
    def handle_msg(msgs: list[WebSocketMessage]):

        # 取每条消息里关心的字段
        for m in msgs:
            # 通用字段
            ev = getattr(m, "event_type", None)
            sym = getattr(m, "symbol", getattr(m, "ticker", None))
            # 统一事件时间：AM 用 bar 结束时间，其它类型用 timestamp
            ts = getattr(m, "timestamp", getattr(m, "end_timestamp", None))

            data = {
                "ev": ev,
                "sym": sym,
                "t": ts,  # 原始毫秒
                "t_utc": to_iso_utc(ts),
                "t_et": to_iso_et(ts),
            }

            # 如果是分钟级聚合（AM），注册所有相关属性
            if ev == "AM":  # 分钟聚合（EquityAgg）
                s = getattr(m, "start_timestamp", None)
                e = getattr(m, "end_timestamp", None)
                data.update(
                    {
                        "v": getattr(m, "volume", None),
                        "av": getattr(m, "accumulated_volume", None),
                        "op": getattr(m, "official_open_price", None),
                        "vw": getattr(m, "vwap", None),  # 窗口 VWAP
                        "o": getattr(m, "open", None),
                        "c": getattr(m, "close", None),
                        "h": getattr(m, "high", None),
                        "l": getattr(m, "low", None),
                        "a": getattr(m, "aggregate_vwap", None),  # 当日 VWAP（聚合）
                        "z": getattr(m, "average_size", None),
                        "s": s,
                        "e": e,
                        "otc": getattr(m, "otc", False),
                    }
                )

            # 把处理好的字典，通过 Socket.IO 广播给前端
            sio.start_background_task(_emit_polygon_data, data, sid)

    # 创建 WebSocket 客户端实例，用于连接 Polygon.io 的延迟行情数据
    ws = WebSocketClient(
        api_key=API_KEY, feed="delayed.polygon.io", market="stocks", subscriptions=subs
    )

    # 保存当前客户端和订阅
    # ws_clients[sid] = ws
    # current_subs[sid] = list(subs)
    ws_client = ws
    current_subs = list(subs)

    # 启动客户端并开始接收数据, 每当收到新消息时，都会调用 handle_msg 回调函数进行处理
    ws.run(handle_msg=handle_msg)


# 定义路由：当用户访问网站根路径 “/” 时，触发下面的视图函数
@app.route("/")
async def index():
    # 渲染 templates/ 目录下的 index.html 模板，并将生成的 HTML 返回给客户端
    return await render_template("index.html")


# 订阅
@sio.on("subscribe_one")
async def subscribe_one(sid, msg):
    global ws_client, ws_thread, current_subs
    sub_to_add = msg.get("subscriptions", [])[0]

    client = ws_client
    # 如果不存在client
    if not client:
        current_subs = [sub_to_add]

        # 创建新线程
        def runner():
            polygon_thread(sid, [sub_to_add])

        t = threading.Thread(target=runner, daemon=True)
        ws_thread = t
        t.start()

        await sio.emit("subscribed", {"subscriptions": [sub_to_add]}, to=sid)
        return

    # 已有连接
    if sub_to_add not in current_subs:
        try:
            client.subscribe(sub_to_add)  # 在现有连接上直接追加
            current_subs.append(sub_to_add)
        except Exception as e:
            print(f"Error subscribing {sub_to_add} for {sid}: {e}")
            return

    await sio.emit(
        "subscribed",
        {"subscriptions": [sub_to_add], "reason": "added to existing connection"},
        to=sid,
    )


# 取消订阅
@sio.on("unsubscribe_one")
async def unsubscribe_one(sid, msg):
    global ws_client, ws_thread, current_subs

    sub_to_remove = msg.get("subscriptions", [])[0]

    client = ws_client
    # 如果不存在client
    if not client:
        await sio.emit(
            "unsubscribed", {"subscriptions": [], "reason": "no active client"}, to=sid
        )
        return

    # 在现有连接上退这一只股票
    try:
        client.unsubscribe(sub_to_remove)
    except Exception as e:
        print(f"unsubscribe error: {e}")

    # 更新本地订阅列表
    subs_list = current_subs
    if sub_to_remove in subs_list:
        subs_list.remove(sub_to_remove)
        current_subs = subs_list

    # 通知前端订阅已取消，发送事件名 "unsubscribed"
    await sio.emit(
        "unsubscribed",
        {"subscriptions": [sub_to_remove], "reason": "manual unsubscribe"},
        to=sid,
    )

    # 如果该 sid 已无任何订阅
    if not current_subs:
        await client.close()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    uvicorn.run(socket_app, host="0.0.0.0", port=port)
