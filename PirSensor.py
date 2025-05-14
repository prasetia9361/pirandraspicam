import RPi.GPIO as GPIO
import time
import socket

PIR_PIN = 17  # GPIO17 (BCM mode)

# Setup GPIO
GPIO.setmode(GPIO.BCM)
GPIO.setup(PIR_PIN, GPIO.IN)

# Setup socket client
HOST = '127.0.0.1'
PORT = 65432

print("Menunggu gerakan...")

try:
    while True:
        if GPIO.input(PIR_PIN):
            print("Gerakan terdeteksi!")

            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.connect((HOST, PORT))
                    s.sendall(b'PIR_TRIGGER')
            except Exception as e:
                print("Gagal kirim ke JS:", e)

            time.sleep(5)  # debounce biar gak spam
        time.sleep(0.1)

except KeyboardInterrupt:
    print("Program dihentikan.")
finally:
    GPIO.cleanup()
