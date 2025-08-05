from flask import Flask, render_template
from flask_socketio import SocketIO, emit
from polygon import WebSocketClient
from polygon.websocket.models import WebSocketMessage
import threading

# 创建 Flask 应用实例
application = Flask(__name__)
# TODO: 环境变量export出一个安全的secret key
application.config["SECRET_KEY"] = "secret!"
# 初始化 Socket.IO 服务端（基于 WebSocket 或长轮询）
socketio = SocketIO(application)

API_KEY = "9bf17dc5-247f-4545-852a-6ee0e9c927ed"


def polygon_thread():
    # 回调：收到 Polygon 的消息后，广播给所有前端
    def handle_msg(msgs: list[WebSocketMessage]):
        # 取每条消息里关心的字段
        for m in msgs:
            data = {
                "ev": m.ev,  # 事件类型，比如 "T" 代表逐笔交易
                "sym": m.sym,  # 股票代码，比如 "AAPL"
                "p": getattr(m, "p", None),  # 价格（如果有的话）
                "t": getattr(m, "t", None),  # 时间戳（如果有的话）
            }
            # 把处理好的字典，通过 Socket.IO 广播给前端，事件名叫 "polygon_data"
            socketio.emit("polygon_data", data)

    # T.AAPL = 苹果的成交数据 T.MSFT = 微软的成交数据
    ws = WebSocketClient(api_key=API_KEY, subscriptions=["T.AAPL", "T.MSFT"])
    # 启动客户端并且将每次收到的消息交给 handle_msg 函数去处理
    ws.run(handle_msg=handle_msg)


# 定义路由：当用户访问网站根路径 “/” 时，触发下面的视图函数
@application.route("/")
def index():
    # 渲染 templates/ 目录下的 index.html 模板，并将生成的 HTML 返回给客户端
    return render_template("index.html")


@socketio.on("connect")
def on_connect():
    # 第一次有客户端连进来时，启动 Polygon 订阅线程（只启动一次）
    if not hasattr(application, "_poly_started"):
        application._poly_started = True
        threading.Thread(target=polygon_thread, daemon=True).start()


if __name__ == "__main__":
    socketio.run(application, host="0.0.0.0", port=5000)
