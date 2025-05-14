const net = require('net');
const server = net.createServer((socket) => {
  socket.on('data', (data) => {
    const message = data.toString();
    if (message === 'PIR_TRIGGER') {
      console.log('📡 Trigger dari sensor PIR diterima.');
      sendImage(); // panggil fungsi kirim gambar
    }
  });

  socket.on('end', () => {
    console.log('🔌 Koneksi dari Python ditutup');
  });
});

server.listen(65432, () => {
  console.log('🟢 Socket server listening on port 65432');
});
