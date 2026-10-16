# 📡 คู่มือระบบเครือข่ายและโปรโตคอลการสื่อสาร (Network API & Message Protocol Documentation)

เอกสารฉบับนี้อธิบายโครงสร้างระบบออนไลน์ (Multiplayer Architecture), รายการ WebSocket Packet, REST API Endpoints และระบบ Server Authority ของเกม **Cyber Survivor** (อ้างอิงจาก Phase 18 & Phase 19)

---

## 🛠️ 1. สถาปัตยกรรมระบบ (System Architecture)

- **เทคโนโลยีหลัก:** Node.js, Express, WebSocket (`ws`)
- **พอร์ตการทำงาน:** Port `3000` (ผ่าน Nginx Reverse Proxy)
- **รูปแบบการทำงาน:** **Server-Authoritative Engine**
  - เครื่องเซิร์ฟเวอร์เป็นผู้ถือครองความถูกต้องของข้อมูลทั้งหมด (Source of Truth)
  - เซิร์ฟเวอร์เป็นผู้สุ่มลูกเต๋า, คำนวณการเดินของตัวหมาก, และจัดการผลของการ์ดสถานการณ์ เพื่อป้องกันการโกง (Anti-Cheat)
  - เซิร์ฟเวอร์ทำหน้าที่ซิงโครไนซ์ `GameState` ไปยังผู้เล่นทุกคนในห้องแบบเรียลไทม์

---

## 🌐 2. รายการ REST API Endpoints

### 2.1 ตรวจสอบสถานะการทำงานของเซิร์ฟเวอร์ (Health Check)
- **URL:** `GET /api/health`
- **Response Format:** `application/json`
- **ตัวอย่างการตอบรับ (Response):**
```json
{
  "status": "ok",
  "activeRooms": 2,
  "timestamp": 1770000000000
}
```

### 2.2 ดึงรายการห้องเล่นที่เปิดอยู่ (List Active Rooms)
- **URL:** `GET /api/rooms`
- **Response Format:** `application/json`
- **ตัวอย่างการตอบรับ (Response):**
```json
{
  "rooms": [
    {
      "roomCode": "SNAKE1",
      "playersCount": 3,
      "maxPlayers": 6,
      "isGameStarted": false,
      "hostName": "ผู้เล่นที่ 1"
    }
  ]
}
```

---

## 📦 3. โครงสร้างข้อความโปรโตคอล (Packet Structure)

การสื่อสารระหว่าง Client และ Server ผ่าน WebSocket ใช้รูปแบบ JSON Packet ที่มีโครงสร้างมาตรฐานดังนี้:

```json
{
  "header": {
    "type": "PACKET_TYPE_NAME",
    "senderId": "player_1770000000_abc12",
    "timestamp": 1770000000000,
    "packetId": "pkt_1770000000_xyz89"
  },
  "payload": {
    "key": "value"
  }
}
```

---

## 📋 4. รายการประเภท Packet ทั้งหมด (Complete Packet Catalog)

| ชื่อ Packet (Packet Type) | ทิศทาง (Direction) | คำอธิบาย (Description) |
| :--- | :--- | :--- |
| `CREATE_ROOM` | Client ➔ Server | ร้องขอสร้างห้องใหม่ ผู้สร้างจะได้รับสิทธิ์เป็นเจ้าของห้อง (Host) |
| `JOIN_ROOM` | Client ➔ Server | เข้าร่วมห้องด้วยรหัสห้อง 6 หลัก (`roomCode`) |
| `LEAVE_ROOM` | Client ➔ Server | แจ้งออกจากห้อง |
| `ROOM_JOINED` | Server ➔ Client | ตอบรับการเข้าห้องสำเร็จ พร้อมส่งข้อมูลห้องและ `playerId` |
| `ROOM_UPDATE` | Server ➔ Broadcast | อัปเดตรายชื่อผู้เล่นและสถานะห้องเมื่อมีการเปลี่ยนแปลง |
| `READY` | Client ➔ Server | สลับสถานะ พร้อมเล่น / ไม่พร้อมเล่น |
| `START_GAME` | Client ➔ Server | เจ้าของห้อง (Host) ส่งสัญญาณสั่งเริ่มเกม (เมื่อผู้เล่นทุกคนพร้อม) |
| `REQUEST_ROLL_DICE` | Client ➔ Server | ผู้เล่นในเทิร์นส่งคำร้องขอทอยลูกเต๋า |
| `DICE_ROLLED` | Server ➔ Broadcast | เซิร์ฟเวอร์ส่งผลการทอยลูกเต๋าแบบสุ่มที่สลักความถูกต้องแล้วให้ทุกคน |
| `REQUEST_MOVE_PLAYER` | Client ➔ Server | ร้องขอการเดินผู้เล่น |
| `MOVE_PLAYER` | Server ➔ Broadcast | เซิร์ฟเวอร์ส่งตำแหน่งใหม่และการเดินของผู้เล่นทีละช่อง |
| `REQUEST_DRAW_CARD` | Client ➔ Server | ร้องขอจั่วการ์ดสถานการณ์ (การ์ดดี / การ์ดไม่ดี) |
| `CARD_EFFECT` | Server ➔ Broadcast | ส่งผลกระทบของการ์ดสถานการณ์ที่ประมวลผลแล้ว |
| `GAME_STATE_SYNC` | Server ➔ Broadcast | ซิงโครไนซ์ GameState ฉบับสมบูรณ์จากเซิร์ฟเวอร์ |
| `PING` | Client ➔ Server | ตรวจสอบการเชื่อมต่อและคำนวณระยะเวลาหน่วง (Latency / RTT) |
| `PONG` | Server ➔ Client | ตอบรับ PING กลับไปยัง Client |
| `PLAYER_DISCONNECTED` | Server ➔ Broadcast | แจ้งเตือนเมื่อผู้เล่นหลุดจากการเชื่อมต่อ |
| `PLAYER_RECONNECTED` | Server ➔ Broadcast | แจ้งเตือนเมื่อผู้เล่นเชื่อมต่อกลับเข้ามาสำเร็จ |
| `ERROR` | Server ➔ Client | แจ้งข้อผิดพลาด (เช่น รหัสห้องไม่ถูกต้อง, ห้องเต็ม) |

---

## 🔒 5. ระบบความปลอดภัยและ Anti-Cheat (Server Authority)

1. **Server-Side Dice Rolling:**
   Client ไม่สามารถกำหนดแต้มลูกเต๋าเองได้ คำขอ `REQUEST_ROLL_DICE` จะถูกสุ่มและยืนยันโดยอัลกอริทึมฝั่ง Server เท่านั้น
2. **Turn Validation:**
   Server ตรวจสอบว่าผู้เล่นที่ส่งคำสั่งเข้ามาเป็นผู้เล่นประจำเทิร์นนั้นจริงหรือไม่ หากไม่ใช่จะปฏิเสธ Packet ทันที
3. **Movement Constraints:**
   ระยะทางในการเดินต้องตรงกับแต้มลูกเต๋าที่ Server สุ่มได้ในเทิร์นนั้น

---

## 🔄 6. ระบบต่อสายใหม่และการย้ายเจ้าของห้อง (Reconnect & Host Migration)

- **Auto Save State:** Server บันทึกสถานะผู้เล่นไว้ในหน่วยความจำ หากผู้เล่นอินเทอร์เน็ตหลุด จะสามารถใช้รหัสเดิมเชื่อมต่อกลับเข้ามาเล่นต่อได้ทันที
- **Host Migration:** หากเจ้าของห้อง (Host) ตัดการเชื่อมต่อ ระบบจะทำการส่งมอบตำแหน่ง Host ให้แก่ผู้เล่นคนถัดไปที่ยังออนไลน์อยู่อัตโนมัติ เพื่อให้เกมดำเนินต่อไปได้โดยไม่สะดุด

---

*เอกสารฉบับนี้อัปเดตล่าสุดสำหรับโปรเจกต์ Cyber Survivor Phase 19*
