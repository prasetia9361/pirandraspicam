const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const readline = require('readline');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  qrcode.generate(qr, {small: true});
});

client.on('authenticated', () => {
  console.log('AUTHENTICATED');
});

client.on('ready', () => {
  console.log('Client is ready!');
  console.log('Press "q" and Enter to send the image');

  // Set up terminal input listener
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', (input) => {
    if (input.toLowerCase() === 'q') {
      sendImage();
    }
  });

  // Function to send image
  const sendImage = async () => {
    const targetNumber = '628xxxxxxxxx@c.us'; // Replace with target number
    const imagePath = 'd:/test.jpeg'; // Make sure the file exists
    const caption = 'Ini gambar dikirim setelah input q!';

    try {
      const media = await MessageMedia.fromFilePath(imagePath);
      await client.sendMessage(targetNumber, media, { caption });
      console.log('🟢 Gambar berhasil dikirim!');
    } catch (err) {
      console.error('🔴 Gagal mengirim gambar:', err);
    }
  };
});

// Handle errors
client.on('disconnected', (reason) => {
  console.log('Disconnected:', reason);
});

client.on('auth_failure', (msg) => {
  console.error('Auth failure:', msg); 
});

client.initialize();

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});