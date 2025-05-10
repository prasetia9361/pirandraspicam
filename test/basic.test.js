const { validateImage } = require('../index');

describe('Validasi Gambar', () => {
  test('Membuang error untuk file tidak ada', () => {
    expect(() => validateImage('./nonexistent.jpg')).toThrow();
  });
});