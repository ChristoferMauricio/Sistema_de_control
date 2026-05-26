import socket

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.connect(("127.0.0.1", 3000))
    print("Port 3000 is open (dev server is running!)")
except Exception as e:
    print("Port 3000 is closed (dev server is NOT running!)")
finally:
    s.close()
