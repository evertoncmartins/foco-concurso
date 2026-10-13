const MAX_FILE_BYTES=5*1024*1024;
const MAX_PHOTO_LENGTH=180000;
export function isProfilePhoto(value){return typeof value==='string'&&value.length<=MAX_PHOTO_LENGTH&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value);}

// Decode locally and store only a small square JPEG, scoped to this account.
export async function prepareProfilePhoto(file,{decode=file=>createImageBitmap(file),createCanvas=()=>document.createElement('canvas')}={}){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Escolha uma foto JPG, PNG ou WebP.');
  if(!file.size||file.size>MAX_FILE_BYTES)throw new Error('A foto deve ter até 5 MB.');
  let image;
  try{image=await decode(file);}catch{throw new Error('Não foi possível abrir essa foto. Escolha outra imagem.');}
  try{
    if(!image.width||!image.height||image.width*image.height>24000000)throw new Error('Escolha uma foto com até 24 megapixels.');
    const canvas=createCanvas();canvas.width=256;canvas.height=256;
    const context=canvas.getContext('2d');if(!context)throw new Error('Seu navegador não conseguiu preparar a foto.');
    context.fillStyle='#f0f2f7';context.fillRect(0,0,256,256);
    const side=Math.min(image.width,image.height);
    context.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,256,256);
    const photo=canvas.toDataURL('image/jpeg',.86);
    if(!isProfilePhoto(photo))throw new Error('Não foi possível preparar essa foto. Escolha outra imagem.');
    return photo;
  }finally{image.close?.();}
}

export function saveProfilePhoto(config,storage,photo){
  if(photo!==''&&!isProfilePhoto(photo))throw new Error('Foto de perfil inválida.');
  storage.setItem('foco:config',JSON.stringify({...config,photo}));
  config.photo=photo;
}
