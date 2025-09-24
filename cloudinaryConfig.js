// cloudinaryConfig.js

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Renderの環境変数からCloudinaryの設定を読み込む
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// アイコンアップロード用の設定
const iconStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat-app-icons', // Cloudinary上の保存先フォルダ名
    allowed_formats: ['jpg', 'png'],
    // ファイル名（ユーザー名など）を動的に設定する例
    public_id: (req, file) => {
      const safeUserName = req.body.userName.replace(/[^a-zA-Z0-9]/g, '_');
      return `icon_${safeUserName}_${Date.now()}`;
    },
  },
});

// 画像メッセージアップロード用の設定
const imageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'chat-app-images',
      allowed_formats: ['jpg', 'png', 'gif'],
      public_id: (req, file) => `image_${Date.now()}`,
    },
});

module.exports = {
  cloudinary,
  iconStorage,
  imageStorage
};