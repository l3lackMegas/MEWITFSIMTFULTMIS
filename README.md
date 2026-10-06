# MY ELYSIA WEB IS TOO FAST SO I MADE THIS FUCKING USELESS LIBRARY TO MAKE IT SLOWER

**MEWITFSIMTFULTMIS** — Elysia เร็วเกินไปใช่ไหม? เสียใจด้วย เราแก้ให้แล้ว

คนอื่นทำ library เพื่อลด latency เราทำเพื่อให้ loading spinner ได้มีอาชีพ
รองรับการรอเฉย ๆ การซื้อ RAM มาเก็บเลขไร้สาระ และการให้ CPU ทำงานที่ไม่มีใครร้องขอ
ทั้งหมดนี้ภายใต้ WTFPL เพราะแม้แต่ license ก็ไม่อยากรับผิดชอบชีวิตคุณ

## Install → import → .use → เสียใจ

```sh
npm i elysia mewitfsimtfultmis
```

```ts
import { Elysia } from 'elysia'
import slow from 'mewitfsimtfultmis'

new Elysia()
  .use(slow({ delaySeconds: 2 }))
  .get('/', () => 'ใช้เวลา 2 วินาทีเพื่อบอกว่า hi')
  .listen(3000)
```

ไม่ส่ง config จะเพิ่ม delay **1 วินาที** ให้ทุก request โดยไม่เผา CPU หรือจอง RAM เพิ่ม
เป็น ESM package พร้อม TypeScript declarations; ทดสอบกับ Elysia 1.4.30,
Node.js 22/24 ผ่าน `app.handle()` และ Bun 1.4.2 ผ่าน HTTP server จริง
ตัวอย่าง `.listen()` ใช้ Bun; บน Node ให้ใช้ adapter ของ Elysia ตามปกติ

## เลือกความไร้ประโยชน์ที่ใช่

```ts
new Elysia().use(slow({
  delaySeconds: 0.5,       // รอ 500 ms แบบ async: เสียเวลา แต่ไม่เสีย CPU
  memoryMegabytes: 64,     // เก็บ Uint8Array ที่เติม 0xa5 แล้ว 64 MiB
  cpuMilliseconds: 25,    // คำนวณเลขที่ไม่มีใครอยากรู้ 25 ms ต่อ request
}))
```

ใช้แต่ละโหมดเดี่ยว ๆ หรือผสมกันได้ ตั้ง `delaySeconds: 0` ถ้าต้องการเฉพาะ RAM/CPU
ไม่มี dependency ตอน runtime นอกจาก peer dependency `elysia`

| Option | Default | ความเสียหายที่สั่งได้ |
| --- | --- | --- |
| `delaySeconds` | `1` | 0–86400 วินาที รับทศนิยม |
| `memoryMegabytes` | `0` | 0–1024 **MiB** ต่อ controller รับทศนิยม |
| `cpuMilliseconds` | `0` | 0–1000 ms ต่อ request รับทศนิยม |
| `ramp` | `null` | `{ start, end }` ค่อย ๆ เพิ่มความอืด |
| `maxPending` | `1000` | จำนวน request ที่รอได้ 1–100000; เกินแล้วตอบ `503` |
| `enabled` | `true` | `false` หยุดความอืด ปล่อยคิว และคืน reference ของ RAM |

ค่าติดลบ, `NaN`, `Infinity`, วันผิดรูปแบบ และช่วงวันที่ย้อนกลับ จะ throw ตอนสร้าง/แก้ config
เราอยากให้มันโง่ตามแผน ไม่ใช่โง่เพราะพิมพ์ผิด

## Scheduled enshittification

วันที่เริ่มยังเร็ว วันที่จบได้สัมผัสความเร็วอินเทอร์เน็ตบ้านญาติ

```ts
import { Elysia } from 'elysia'
import slow from 'mewitfsimtfultmis'

new Elysia()
  .use(slow({
    delaySeconds: 2,
    memoryMegabytes: 128,
    cpuMilliseconds: 50,
    ramp: {
      start: '2026-11-01T00:00:00+07:00',
      end:   '2026-12-01T00:00:00+07:00',
    },
  }))
  .get('/', () => 'คุณรอขนาดนี้เพื่อสิ่งนี้เหรอ')
  .listen(3000)
```

`start`/`end` รับ `Date`, Unix epoch **milliseconds**, หรือ ISO timestamp ที่ระบุ
`Z`/offset ชัดเจน ไม่รับวันที่ลอย ๆ อย่าง `2026-11-01` เพราะ timezone ไม่ควรเป็นมุกตลกตัวที่สอง

```text
progress = clamp((now - start) / (end - start), 0, 1)
delay    = delaySeconds × progress
RAM      = memoryMegabytes × progress
CPU      = cpuMilliseconds × progress
spacing  = 1000 ms × progress
```

| ช่วงเวลา | ค่า delay/RAM/CPU | ระยะห่างขั้นต่ำที่ปล่อย request |
| --- | --- | --- |
| ก่อน/ตรงวันเริ่ม | 0% | ไม่มี |
| ครึ่งทาง | 50% | 500 ms (สูงสุดประมาณ 2 req/s) |
| ตรง/หลังวันจบ | 100% | 1000 ms (สูงสุด 1 req/s) |

**1 req/s คืออัตราที่ผ่าน hook ต่อ controller ใน process เดียว** ทุก request แชร์คิว FIFO
เมื่อว่าง request แรกผ่านได้ทันทีหลังครบ delay และ CPU ของมัน ตัวถัดไปห่างอย่างน้อยหนึ่งวินาที
ไม่มีการสะสม token เพื่อปล่อย burst ชดเชยตอน event loop กลับมาทำงาน
delay เป็นเวลารอขั้นต่ำจากตอนเข้าคิว จึงรอซ้อนกันได้; CPU ทำหลังรอ และอาจเพิ่ม latency อีก

นี่ไม่ใช่คำสัญญาว่า response จะเสร็จตรงทุกวินาที: handler ของคุณอาจช้ากว่าอยู่แล้ว
และ `503` จากคิวเต็มตอบได้ทันที ไม่ถูกนับเป็น request ที่ผ่านเข้าแอป
ถ้ารัน 4 workers จะมี 4 คิวและรวมได้ถึง 4 req/s; ไม่มี distributed limiter ซ่อนอยู่
ตั้งเฉพาะ `ramp` ก็เปิด gate นี้ได้ แม้ค่า delay/RAM/CPU เป็นศูนย์ทั้งหมด
หากไม่มี `ramp` จะมีเฉพาะต้นทุนที่ตั้งไว้ ไม่มี rate gate

## เปลี่ยนใจกลาง runtime โดยไม่ restart

```ts
import { Elysia } from 'elysia'
import { createSlowdown } from 'mewitfsimtfultmis'

const misery = createSlowdown({ delaySeconds: 0.2 })
const app = new Elysia()
  .use(misery.plugin)
  .get('/', () => 'still waiting?')
  .listen(3000)

// เรียกจาก config watcher, CLI หรือ control plane ของคุณ
misery.configure({
  delaySeconds: 2,
  memoryMegabytes: 32,
  cpuMilliseconds: 10,
  ramp: { start: Date.now(), end: Date.now() + 3_600_000 },
})

console.log(misery.snapshot())
// progress, delayMilliseconds, memoryBytes, allocatedBytes,
// cpuMilliseconds, intervalMilliseconds, pending, config, disposed

misery.configure({ ramp: null })     // ถอด schedule แต่ยังคงต้นทุนที่ตั้งไว้
misery.configure({ enabled: false }) // กลับไปเร็ว น่าผิดหวังมาก
misery.configure({ enabled: true })  // กลับมาตัดสินใจผิดอีกครั้ง

await app.stop() // dispose อัตโนมัติ
// หรือ misery.dispose() เมื่อเลิกใช้ controller ด้วยตัวเอง
```

`configure()` เป็น partial update; `ramp` ใหม่ต้องมีทั้ง `start` และ `end`
ค่าจะถูกตรวจสอบก่อนเปลี่ยน state และคิวที่กำลังรอจะคำนวณตาม config ใหม่
งาน CPU ที่เริ่มแล้วจะจบก่อนรับ config ใหม่ เพราะมันกำลังบล็อก thread อยู่จริง ๆ
การลด `maxPending` ไม่ไล่ request เดิมออก แต่ไม่รับเพิ่มจนคิวต่ำกว่า limit
`snapshot()` เป็นข้อมูลสำหรับอ่าน ไม่ใช่ช่องทางแก้ config
`dispose()` เรียกซ้ำได้ คืน RAM references ยกเลิก timer และจบ request ที่รอด้วย `503`;
controller ที่ dispose แล้วใช้ต่อไม่ได้ สร้างใหม่ถ้าคิดถึงความอืด

## รายละเอียดที่น่าเสียดายว่าเราทำจริงจัง

- Hook ใช้ `onRequest` ซึ่งเป็น global lifecycle ของ Elysia จึงครอบคลุม nested plugins,
  route ที่ประกาศก่อน `.use()` และแม้แต่ `404` โดยไม่แตะ body, schema หรือ response ปกติ
  hook ก่อนหน้าที่ตอบกลับทันทีอาจข้าม plugin นี้ได้ จึงควรวาง `.use()` ไว้ต้น ๆ
- ทุก controller มี plugin identity แยกกัน; ใช้ instance เดิมซ้ำถูก deduplicate
  แชร์ controller ข้ามแอปคือแชร์คิว/RAM ด้วย และหยุดแอปใดแอปหนึ่งจะ dispose controller นั้น
- RAM เป็น pool **รวมต่อ controller** ไม่ได้คูณตามจำนวน request เติมข้อมูลจริงใน chunks ขนาด
  ไม่เกิน 1 MiB; เพิ่มตาม ramp ขณะมี request และคืน reference เมื่อปรับลด/ปิด/stop
  ไม่มี background allocation ตอน server ว่าง และ GC/OS อาจยังไม่คืน RSS ทันที
- CPU เป็น busy loop บน event loop จริง ๆ ไม่ใช่ `sleep()` ใส่หนวดปลอม
  กระทบ request อื่นใน process ด้วย; ค่า ms เป็นระยะเวลา loop โดยประมาณ ไม่ใช่ CPU utilization %
- รับ abort ผ่าน `Request.signal` ลบ request ออกจากคิวและตอบ `499` หาก runtime ส่งสัญญาณยกเลิกมา
- ใช้ wall clock เลือกตำแหน่ง ramp และ monotonic clock เว้นระยะ request
  ไม่มี timer ค้างหลังคิวว่างหรือ dispose; queue เต็มตอบ `503` พร้อม `Retry-After: 1`

นี่คือเครื่องมือทำให้ server ของคุณช้าแบบตั้งใจ ตัวเลข RAM/CPU จึงเป็นต้นทุนจริง
ถ้าคุณเอาไปใช้ production แล้วมันช้า นั่นคือ test ผ่าน

## Development

ใช้ Node.js 22+ และ Bun 1.4.2 สำหรับ HTTP integration test

```sh
npm ci
npm run check         # strict types + unit/integration tests + build
npm run test:bun      # Bun server จริง และ cleanup ตอน stop
npm run test:package  # pack → install ลง consumer ใหม่ → import/.use/types
npm run example      # ค่อย ๆ พังภายในหนึ่งนาที บน localhost:3000
```

Tests ใช้ fake clock ตรวจช่วงวัน คิว FIFO, runtime update, cancellation และเวลาที่ timer มาช้า
พร้อม real-clock tests ตรวจ Elysia และ HTTP pacing ตอนสิ้นสุด ramp
ไม่มีการตั้งใจ allocate RAM เป็น GB ใน CI เพราะ GitHub ไม่ได้ทำอะไรผิด

## Publish ไปสร้างปัญหาให้ npm

Repository: [l3lackMegas/MEWITFSIMTFULTMIS](https://github.com/l3lackMegas/MEWITFSIMTFULTMIS)

- `ci.yml`: ตรวจ Node 22/24, package consumer และ Bun HTTP integration บน push/PR
- `publish.yml`: เมื่อ push tag `vX.Y.Z` จะตรวจ version, build, tests, tarball แล้ว publish ผ่าน OIDC
  ใช้ Node 24/npm ที่รองรับ trusted publishing, GitHub-hosted runner และ `id-token: write`
  ไม่มี `NPM_TOKEN` ที่ต้องเอาไปซ่อนใต้พรม

### Bootstrap ครั้งแรก

ถ้า package ยังไม่อยู่บน npm ให้เจ้าของชื่อ login และ publish ครั้งแรกจาก checkout นี้:

```sh
npm login
npm ci
npm run test:bun
npm publish --access public
```

`prepublishOnly` จะตรวจ types/tests/build/installed package อีกครั้งก่อน publish
npm อาจขอ browser authentication หรือ 2FA จากเจ้าของบัญชี

จากนั้นที่ npm package settings → **Trusted Publisher** → **GitHub Actions** ตั้ง:

| Field | Value |
| --- | --- |
| Organization or user | `l3lackMegas` |
| Repository | `MEWITFSIMTFULTMIS` |
| Workflow filename | `publish.yml` |
| Environment name | เว้นว่าง (workflow นี้ไม่ได้ตั้ง environment) |
| Allowed actions | อนุญาต `npm publish` |

Owner ของ GitHub ในตารางไม่จำเป็นต้องเหมือน username ของ npm
อย่าใส่ `.github/workflows/` ใน workflow filename และอย่า tag เวอร์ชันที่ publish ไปแล้ว
provenance เกิดอัตโนมัติเมื่อใช้ trusted publishing กับ public repo/package
GitHub/npm account settings ต้องตั้งจริงก่อน workflow จะ publish ได้; ไฟล์ YAML ไม่ใช่เวทมนตร์

### Release ครั้งต่อไป

จาก working tree ที่สะอาดและ commit งานไว้แล้ว:

```sh
npm version patch
git push origin main --follow-tags
```

tag ต้องตรงกับ `package.json`; workflow นี้ส่งเฉพาะ stable versions ไป `latest`
อย่า publish เวอร์ชันเดิมซ้ำ เพราะ npm มีความจำดีกว่าเรา

## References

Implementation อ้างอิง [Elysia plugins](https://elysiajs.com/essential/plugin),
[request lifecycle](https://elysiajs.com/essential/life-cycle),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) และ
[GitHub setup-node](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md)
พร้อมตรวจพฤติกรรมกับ dependency ที่ lock ไว้จริง

## License

[WTFPL v2](LICENSE). You just DO WHAT THE FUCK YOU WANT TO.
รวมถึงการ uninstall แล้วได้ performance คืนมา ซึ่งน่าจะเป็น optimization ที่ดีที่สุดใน README นี้
