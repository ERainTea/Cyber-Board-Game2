/**
 * @file src/Utils/security.js
 * @description ยูทิลิตี้สำหรับป้องกันช่องโหว่ความปลอดภัย เช่น Cross-Site Scripting (XSS)
 * ทำการ Escape ตัวอักษรพิเศษของ HTML และตรวจสอบความถูกต้องของข้อความที่ผู้ใช้กรอก
 */

/**
 * แปลงอักขระพิเศษของ HTML ให้เป็น HTML Entities เพื่อป้องกัน XSS เมื่อแสดงผลผ่าน innerHTML หรือ attribute
 * @param {*} str - ข้อความที่ต้องการ Escape
 * @returns {string} ข้อความที่ปลอดภัยจาก HTML Injection
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * กรองข้อความโดยตัดแท็ก HTML ทั้งหมดออก และลบอักขระเสี่ยงสำหรับ Injection พร้อมจำกัดความยาวสูงสุด
 * @param {*} str - ข้อความดิบ
 * @param {number} [maxLength=24] - ความยาวสูงสุดที่อนุญาต
 * @returns {string} ข้อความที่ผ่านการกรองแล้ว
 */
export function sanitizePlainText(str, maxLength = 24) {
  if (!str) return '';
  // 1. ลบ block tag อันตรายรวมถึงเนื้อหาข้างใน เช่น <script>...</script>, <style>...</style>, <iframe>...</iframe>
  let cleaned = String(str).replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // 2. ลบแท็ก HTML ที่เหลือทั้งหมด เช่น <img ...>, <div>, <svg> ฯลฯ
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  // 3. ลบอักขระเสี่ยงสำหรับ HTML/JS Injection
  cleaned = cleaned.replace(/[<>'"&`/\\]/g, '');
  // 4. ลดช่องว่างซ้ำซ้อนและตัดหัวท้าย
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // 5. จำกัดความยาวสูงสุด
  return cleaned.slice(0, maxLength);
}
