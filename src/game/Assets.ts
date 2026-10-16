/**
 * @file src/game/Assets.ts
 * @description คลังเก็บ Asset รูปภาพและไอคอนทั้งหมดผ่าน Cloudinary CDN
 * พร้อมระบบพรีโหลดรูปภาพเพื่อความลื่นไหลของเกม
 */

export const ASSET_URLS = {
  /** รูปภาพอวตารผู้เล่น */
  avatars: [
    'https://res.cloudinary.com/demo/image/upload/v1680000000/avatars/avatar_elephant.png',
    'https://res.cloudinary.com/demo/image/upload/v1680000000/avatars/avatar_cat.png',
    'https://res.cloudinary.com/demo/image/upload/v1680000000/avatars/avatar_shiba.png',
    'https://res.cloudinary.com/demo/image/upload/v1680000000/avatars/avatar_panda.png',
  ],

  /** รูปภาพสถานที่ท่องเที่ยวไทยบนกระดาน */
  landmarks: {
    bangkok: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=400&q=80',
    chiangmai: 'https://images.unsplash.com/photo-1598970434795-0c54fe7c0648?auto=format&fit=crop&w=400&q=80',
    phuket: 'https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?auto=format&fit=crop&w=400&q=80',
    pattaya: 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=400&q=80',
    samui: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=400&q=80',
    ayutthaya: 'https://images.unsplash.com/photo-1563492065599-3520f775eeed?auto=format&fit=crop&w=400&q=80',
  },

  /** รูปภาพประกอบการ์ดเสี่ยงโชค */
  cards: {
    chanceBg: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=400&q=80',
    chestBg: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=400&q=80',
  },

  /** รูปภาพบ้านและโรงแรม */
  buildings: {
    house: 'https://cdn-icons-png.flaticon.com/512/619/619153.png',
    hotel: 'https://cdn-icons-png.flaticon.com/512/2942/2942523.png',
  },

  /** รูปภาพกระดาน Cyber Board Game */
  board: 'https://res.cloudinary.com/dedvuatid/image/upload/v1786605946/Cyber_Board_Game_%E0%B8%81%E0%B8%A3%E0%B8%B0%E0%B8%94%E0%B8%B2%E0%B8%99_-Cyber_Hero_zwjqzl.jpg',

  /** รูปภาพคู่มือ Cyber Board Game (11 หน้า) */
  manual: [
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606574/1T_dbjpas.png',
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606574/2T_qstxmz.png',
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606572/3T_v15sii.png',
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606572/4T_rtqlxp.png',
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606572/5T_tl3mob.png',
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606571/6T_erevrx.png',
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606570/7T_bfmecz.png',
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606570/8T_j2umtl.png',
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606569/9T_lsfhi5.png',
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606569/10T_qzsycj.png',
    'https://res.cloudinary.com/dedvuatid/image/upload/v1786606569/11T_i9tp0p.png',
  ],
};

/**
 * ฟังก์ชันพรีโหลดรูปภาพล่วงหน้า เพื่อไม่ให้เกิดอาการกระตุกขณะเล่น
 * @param urls รายการ URL ของรูปภาพ
 * @returns Promise<boolean>
 */
export async function preloadImages(urls: string[]): Promise<boolean> {
  const promises = urls.map((url) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = url;
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
  });

  try {
    await Promise.all(promises);
    return true;
  } catch {
    return false;
  }
}
