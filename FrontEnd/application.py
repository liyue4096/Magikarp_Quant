from quart import Quart, render_template
import socketio
from polygon import WebSocketClient
from polygon.websocket.models import WebSocketMessage
import threading
import uvicorn
import os

# 创建 Quart 应用实例
app = Quart(__name__)
# TODO: 环境变量export出一个安全的secret key
app.config["SECRET_KEY"] = "secret!"
# 初始化 SocketIO 服务端，与前端网页交互
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, app)

# 对外的 WebSocket 客户端，连向 Polygon.io 的服务器
ws_client = None
ws_thread = None

# 全局保存当前订阅
current_subs: list[str] = []

API_KEY = "123"

async def _emit_polygon_data(data):
    await sio.emit("polygon_data", data)

def polygon_thread(subs: list[str]):
    print(f"polygon_thread running with subs={subs}")

    # 回调：收到 Polygon 的消息后，广播给所有前端
    def handle_msg(msgs: list[WebSocketMessage]):
        print(f"Received {len(msgs)} messages from Polygon")

        # 取每条消息里关心的字段
        for m in msgs:
            # 通用字段
            data = {
                "ev": m.ev,  # 事件类型，比如 "AM"
                "sym": m.sym,  # 股票代码
                "t": getattr(m, "t", None),  # Unix ms timestamp
            }
            print("🔔 Received from Polygon:", data)

            # 如果是分钟级聚合（AM），注册所有相关属性
            if m.ev == "AM":
                data.update(
                    {
                        "v": getattr(m, "v", None),  # tick volume
                        "av": getattr(m, "av", None),  # 今日累计成交量
                        "op": getattr(m, "op", None),  # 今日官方开盘价
                        "vw": getattr(m, "vw", None),  # 本窗口 VWAP
                        "o": getattr(m, "o", None),  # 本窗口开盘价
                        "c": getattr(m, "c", None),  # 本窗口收盘价
                        "h": getattr(m, "h", None),  # 本窗口最高价
                        "l": getattr(m, "l", None),  # 本窗口最低价
                        "a": getattr(m, "a", None),  # 当日 VWAP
                        "z": getattr(m, "z", None),  # 本窗口平均成交量大小
                        "s": getattr(m, "s", None),  # 窗口开始时间（Unix ms）
                        "e": getattr(m, "e", None),  # 窗口结束时间（Unix ms）
                        "otc": getattr(
                            m, "otc", False
                        ),  # 是否 OTC，False 时可能不存在此属性
                    }
                )

            # 把处理好的字典，通过 Socket.IO 广播给前端
            sio.start_background_task(_emit_polygon_data, data)

    # 创建 WebSocket 客户端实例，用于连接 Polygon.io 的延迟行情数据
    ws = WebSocketClient(
        api_key=API_KEY, feed="delayed.polygon.io", market="stocks", subscriptions=subs
    )
    # 启动客户端并开始接收数据, 每当收到新消息时，都会调用 handle_msg 回调函数进行处理
    ws.run(handle_msg=handle_msg)


# 定义路由：当用户访问网站根路径 “/” 时，触发下面的视图函数
@app.route("/")
async def index():
    # 渲染 templates/ 目录下的 index.html 模板，并将生成的 HTML 返回给客户端
    return await render_template("index.html")


# 订阅
@sio.on("subscribe")
async def subscribe(sid, message):
    global ws_client, ws_thread, current_subs

    # 从客户端消息获得新的订阅列表并储存到全局变量
    subs = message.get("subscriptions", [])
    prev_subs = current_subs
    current_subs = subs

    # 如果已有订阅，先关掉
    if ws_client:
        await ws_client.close()
        ws_client = None
         # 通知前端，旧的订阅已取消，原因是开始了新的订阅
        await sio.emit(
            "unsubscribed",
            {"subscriptions": prev_subs, "reason": "new subscription"},
            to=sid,
        )

    # 启动一个新线程跑 polygon_thread
    ws_client = WebSocketClient(api_key=API_KEY, subscriptions=subs)
    ws_thread = threading.Thread(
        target=lambda: polygon_thread(subs), daemon=True  # 守护线程
    )
    ws_thread.start()

    # 通知前端订阅生效
    await sio.emit("subscribed", {"subscriptions": subs}, to=sid)


# 取消订阅
@sio.on("unsubscribe")
async def unsubscribe(sid):
    global ws_client, current_subs
    
    # 如果当前有活跃的 Polygon.io WebSocket 客户端，就关闭连接
    if ws_client:
        await ws_client.close()
        ws_client = None

    # 通知前端订阅已取消，发送事件名 "unsubscribed"
    await sio.emit(
        "unsubscribed", {"subscriptions": current_subs, "reason": "manual unsubscribe"}
    )

    # 清空全局订阅列表，重置为无订阅状态
    current_subs = []

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    uvicorn.run(socket_app, host="0.0.0.0", port=port)