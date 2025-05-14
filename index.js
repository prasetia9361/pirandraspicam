const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { Gpio } = require('onoff').Gpio;
const pir = new Gpio(27, "in", "both");
require('dotenv').config();

// Konfigurasi awal
const config = {
  targetNumber: process.env.TARGET_NUMBER + '@c.us',
  imagePath: process.env.IMAGE_PATH || './default.jpg',
  interval: process.env.INTERVAL || 3600000,
  chromePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser'
};

// Validasi environment variables
if (!process.env.TARGET_NUMBER) {
  console.error('❌ TARGET_NUMBER harus diisi di file .env');
  process.exit(1);
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
  puppeteer: {
    headless: true,
    executablePath: config.chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--single-process',
      '--no-zygote',
      '--user-data-dir=/tmp/chrome-profile'
    ]
  }
});

// Fungsi terpisah untuk logging
const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] ❌ ${msg}`),
  success: (msg) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`)
};

// Validasi file gambar
const validateImage = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File tidak ditemukan: ${path.resolve(filePath)}`);
  }

  const allowedExtensions = ['.jpg', '.jpeg', '.png'];
  const ext = path.extname(filePath).toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Ekstensi file tidak didukung: ${ext}`);
  }
};

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  logger.success('Autentikasi berhasil');
});

client.on('ready', async () => {
  logger.success('Client siap!');
  logger.info('Tekan "q" untuk mengirim gambar');

  try {
    // Validasi nomor tujuan
    const isValidNumber = await client.isRegisteredUser(config.targetNumber);
    if (!isValidNumber) {
      logger.error('Nomor tidak terdaftar di WhatsApp');
      return;
    }

    // Validasi file gambar
    validateImage(config.imagePath);

    // Pasang listener PIR di sini
    pir.watch(async (err, value) => {
      if (err) {
        logger.error(`Sensor error: ${err.message}`);
        return;
      }

      if (value === 1) {
        logger.info('Gerakan terdeteksi dari sensor PIR');
        await sendAutoImage();
      }
    });

    // Setup input keyboard
    process.stdin.setEncoding('utf8');
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    process.stdin.on('data', async (key) => {
      // Tekan Ctrl+C atau 'q' untuk keluar
      if (key === '\u0003') {
        logger.info('Mematikan client...');
        await client.destroy();
        process.exit();
      } else if (key.toString().trim().toLowerCase() === 'q') {
        await sendAutoImage();
      }
    });

  } catch (err) {
    logger.error(`Gagal inisialisasi: ${err.message}`);
    process.exit(1);
  }
});

// Fungsi terpisah untuk mengirim gambar \
const sendAutoImage = async () => {
  try {
    const media = await MessageMedia.fromFilePath(config.imagePath);
    await client.sendMessage(config.targetNumber, media, {
      caption: process.env.CAPTION || 'Ini gambar otomatis'
    });
    logger.success(`Gambar berhasil dikirim ke ${config.targetNumber}`);
  } catch (err) {
    logger.error(`Gagal mengirim gambar: ${err.message}`);
  }
};

// Handle shutdown
process.on('SIGINT', async () => {
  logger.info('Mematikan client...');
  await client.destroy();
  logger.info('Client dimatikan');
  pir.unexport();
  process.exit();
});

// Handle error global
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
});

client.initialize();
