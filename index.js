const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const {exec} = require('child_process');
const path = require('path');
const { promisify } = require('util');
var GPIO= require('onoff').Gpio;
var pir = new GPIO(538, 'in', 'both'); // 538 is gpio 26
const LED1 = new GPIO(514, "out");
const LED2 = new GPIO(516, "out");
require('dotenv').config();
//process.env.UV_THREADPOOL_SIZE = '2'; // Kurangi thread pool
//const execAsync = promisify(exec); // Gunakan promisify untuk exec

// Konfigurasi awal
const config = {
  targetNumber: process.env.TARGET_NUMBER + '@c.us',
  imagePath: process.env.IMAGE_PATH || './default.jpg',//'./tmp/capture.jpeg' 
  interval: process.env.INTERVAL || 3600000,
  chromePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser'
};


const OUTPUT_DIR_NAME = 'tmp';
const OUTPUT_DIR = path.join(__dirname, OUTPUT_DIR_NAME); // Creates a path like /home/pi/your_project_folder/captures_libcamera

// 3. Ensure the output directory exists, create it if it doesn't
// This is where fs.existsSync and fs.mkdirSync are used.
if (!fs.existsSync(OUTPUT_DIR)) {
	fs.mkdirSync(OUTPUT_DIR, { recursive: true }); // 'recursive: true' creates parent directories if needed
	console.log(`Created directory: ${OUTPUT_DIR}`);
}

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
      '--single-process'
    ]
  }
});

// Fungsi terpisah untuk logging
const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] ❌ ${msg}`),
  success: (msg) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`)
};

const captureImageLibcamera = (fileName = 'capture.jpg') => {
    const filePath = path.join(OUTPUT_DIR, fileName);
    const command = `libcamera-jpeg -o "${filePath}" -t 500 --width 1280 --height 720 --quality 50 --nopreview`;
    
    return new Promise((resolve, reject) => {
        exec(command, (error) => {
            error ? reject(error) : resolve(filePath);
        });
    });
};

// Fungsi terpisah untuk mengirim gambar
const sendAutoImage = async () => {
  try {
    const media = await MessageMedia.fromFilePath(config.imagePath);
    const message = await client.sendMessage(config.targetNumber, media, { 
      caption: process.env.CAPTION 
    });
    
    if(message.id.fromMe) {
        fs.unlinkSync(config.imagePath);
        LED2.writeSync(1);
        setTimeout(() => LED2.writeSync(0), 1000);
    }
  } catch (err) {
    logger.error(`Gagal mengirim: ${err.message}`);
  }
};

async function main(){
  client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    logger.success('Autentikasi berhasil');
  });
  
  try{
    
    client.on('ready', async () => {
      logger.success('Client siap!');
      LED1.writeSync(1);
      //logger.info('Tekan "q" untuk mengirim gambar');
	  
	  
      try {
        // Validasi nomor tujuan
        const isValidNumber = await client.isRegisteredUser(config.targetNumber);
        if (!isValidNumber) {
          logger.error('Nomor tidak terdaftar di WhatsApp');
          return;
        }

        // Setup input keyboard
        process.stdin.setEncoding('utf8');
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        let isProcessing = false; 
        process.stdin.on('data', async (key) => {
          // Tekan Ctrl+C atau 'q' untuk keluar
          if (key === '\u0003') {
            logger.info('Mematikan client...');
            await client.destroy();
		    LED1.writeSync(0);
            process.exit();
          } 
        });
		// Tambahkan debounce untuk PIR sensor
		const COOLDOWN = 3000; // 3 detik
		let lastTrigger = 0;
		pir.watch(async (err, value) => {
			if (err || Date.now() - lastTrigger < COOLDOWN) {
				console.log('sensor pir error');
				return;}
			if (value === 1) {
				lastTrigger = Date.now();
				try {
					await captureImageLibcamera();
					await sendAutoImage();
				} catch(err) {
					logger.error(`Error processing: ${err.message}`);
				}
			}
		});
      } catch (err) {
        logger.error(`Gagal inisialisasi: ${err.message}`);
        process.exit(1);
      }
    });
    
    } catch (err){
      logger.error(`Gagal inisialisasi: ${err.message}`);
//      process.exit(1);
      }
  }

main();

// Handle shutdown
process.on('SIGINT', async () => {
  logger.info('Mematikan client...');
  await client.destroy();
  logger.info('Client dimatikan');
  LED1.writeSync(0);
  pir.unexport();
  process.exit();
});

// Handle error global
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
});

client.initialize();
