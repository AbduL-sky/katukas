import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import Database from 'better-sqlite3';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || (process.env.NODE_ENV === 'production' ? '' : 'change-this-admin-key');
if (process.env.NODE_ENV === 'production' && ADMIN_KEY.length < 32) {
  throw new Error('Set ADMIN_KEY to a random secret of at least 32 characters in production.');
}
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const WHATSAPP_NUMBER = (process.env.WHATSAPP_NUMBER || '').replace(/\D/g, '');
const db = new Database(path.join(__dirname, 'data', 'katukas.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS menu_items (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL,image TEXT NOT NULL,featured INTEGER DEFAULT 0,available INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT,customer_name TEXT NOT NULL,phone TEXT NOT NULL,email TEXT,address TEXT,order_type TEXT NOT NULL,notes TEXT,total INTEGER NOT NULL,status TEXT DEFAULT 'pending',payment_status TEXT DEFAULT 'unpaid',payment_reference TEXT,paid_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,item_id INTEGER NOT NULL,name TEXT NOT NULL,qty INTEGER NOT NULL,price INTEGER NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id));
CREATE TABLE IF NOT EXISTS reservations (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT NOT NULL,email TEXT,date TEXT NOT NULL,time TEXT NOT NULL,guests INTEGER NOT NULL,notes TEXT,status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
for (const migration of [
  "ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'unpaid'",
  "ALTER TABLE orders ADD COLUMN payment_reference TEXT",
  "ALTER TABLE orders ADD COLUMN paid_at TEXT"
]) { try { db.exec(migration); } catch {} }

const count = db.prepare('SELECT COUNT(*) c FROM menu_items').get().c;
if (!count) {
  const items = [
    ['Jollof Rice & Grilled Chicken','Smoky party jollof, char-grilled chicken, fried plantain and house slaw','Mains',6500,'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85',1],
    ['Suya Platter','Spiced beef suya, onions, tomatoes and yaji pepper with fries','Grills',7500,'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=85',1],
    ['Egusi & Pounded Yam','Rich melon-seed soup with assorted meat and silky pounded yam','Nigerian',7000,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',1],
    ['Coconut Curry Prawns','Tiger prawns in coconut curry, served with fragrant basmati rice','Mains',9000,'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?auto=format&fit=crop&w=900&q=85',0],
    ['Peppered Chicken Wings','Crispy wings tossed in our signature sweet pepper glaze','Starters',5500,'https://images.unsplash.com/photo-1527477396000-e27163b481c2?auto=format&fit=crop&w=900&q=85',0],
    ['Plantain & Pepper Sauce','Golden ripe plantain with smoky roasted pepper dip','Starters',3500,'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85',0],
    ['Zobo Spritz','Chilled hibiscus, ginger, citrus and sparkling water','Drinks',2500,'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85',0],
    ['Pineapple Ginger Cooler','Fresh pineapple, ginger, lime and mint','Drinks',2500,'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=85',0],
    ['Chin Chin Cheesecake','Creamy cheesecake finished with crunchy chin chin crumbs','Desserts',4500,'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=900&q=85',1]
  ];
  const ins = db.prepare('INSERT INTO menu_items(name,description,category,price,image,featured) VALUES(?,?,?,?,?,?)');
  db.transaction(() => items.forEach(x => ins.run(...x)))();
}

const suggestedItems = [
  ['Jollof Rice & Plantains','Smoky Nigerian jollof rice with sweet fried plantains','Rice Plates',4500,'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85',0],
  ['Fried Rice & Chicken','Vegetable fried rice served with seasoned chicken','Rice Plates',5500,'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85',0],
  ['White Rice & Tomato Stew','Steamed rice with rich Nigerian tomato stew','Rice Plates',3500,'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85',0],
  ['Ofada Rice & Ayamase','Local Ofada rice with a bold green pepper sauce','Rice Plates',6500,'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85',0],
  ['Coconut Rice & Chicken','Fragrant coconut rice served with grilled chicken','Rice Plates',5500,'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85',0],
  ['Native Rice & Smoked Fish','Seasoned local rice with smoked fish','Rice Plates',6000,'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85',0],
  ['Beans & Fried Plantain','Slow-cooked beans with ripe fried plantain','Local Favourites',3500,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Yam Porridge','Soft yam simmered in a savory pepper sauce','Local Favourites',3500,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Tuwo Shinkafa & Miyan Kuka','Rice tuwo served with traditional baobab leaf soup','Local Favourites',4500,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Miyan Taushe & Tuwo','Pumpkin and groundnut soup served with soft tuwo','Local Favourites',5000,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Moi Moi','Steamed bean pudding seasoned with peppers and spices','Small Bites',1500,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Akara & Pap','Golden bean fritters with smooth pap','Small Bites',2000,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Egusi Soup & Eba','Melon seed soup with assorted meat and garri swallow','Soups & Swallows',5000,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Okra Soup & Semovita','Fresh okra soup served with semovita','Soups & Swallows',4500,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Efo Riro & Pounded Yam','Leafy spinach stew with assorted meat and pounded yam','Soups & Swallows',6500,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Afang Soup & Fufu','Afang leaf soup with assorted meat and fufu','Soups & Swallows',7000,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Goat Meat Pepper Soup','Spicy, warming pepper soup with tender goat meat','Soups & Swallows',7000,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Beef Suya','Yaji-spiced grilled beef with onions and tomatoes','Grills',5000,'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=85',0],
  ['Grilled Tilapia','Whole grilled tilapia with pepper sauce','Grills',8500,'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=85',0],
  ['Peppered Turkey','Tender turkey tossed in a bold pepper sauce','Grills',8000,'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=85',0],
  ['Puff Puff','Soft golden Nigerian dough bites','Small Bites',1500,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85',0],
  ['Chicken Shawarma','Chicken, fresh vegetables and sauce wrapped in flatbread','Small Bites',5000,'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=85',0],
  ['Fresh Zobo','Chilled hibiscus drink with ginger','Drinks',1500,'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85',0],
  ['Chapman','Classic Nigerian fruit and citrus drink','Drinks',2500,'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85',0],
  ['Pineapple Juice','Fresh pineapple juice served chilled','Drinks',2500,'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85',0]
];
const addSuggestedItem = db.prepare(`INSERT INTO menu_items(name,description,category,price,image,featured)
  SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE name=?)`);
db.transaction(() => suggestedItems.forEach(item => addSuggestedItem.run(...item, item[0])))();
const menuImages = [
  ['Chin Chin Cheesecake','photo-1565958011703-44f9829ba187'],
  ['Suya Platter','photo-1555939594-58d7cb561ad1'],
  ['Jollof Rice & Grilled Chicken','photo-1603133872878-684f208fb84b'],
  ['Egusi & Pounded Yam','photo-1601050690597-df0568f70950'],
  ['Pineapple Ginger Cooler','photo-1544145945-f90425340c7e'],
  ['Zobo Spritz','photo-1556679343-c7306c1976bc'],
  ['Coconut Curry Prawns','photo-1562565652-a0d8f0c59eb4'],
  ['Peppered Chicken Wings','photo-1527477396000-e27163b481c2'],
  ['Plantain & Pepper Sauce','photo-1512621776951-a57141f2eefd'],
  ['Jollof Rice & Plantains','photo-1504674900247-0877df9cc836'],
  ['Fried Rice & Chicken','photo-1604329760661-e71dc83f8f26'],
  ['White Rice & Tomato Stew','photo-1490645935967-10de6ba17061'],
  ['Ofada Rice & Ayamase','photo-1540189549336-e6e99c3679fe'],
  ['Coconut Rice & Chicken','photo-1547592180-85f173990554'],
  ['Native Rice & Smoked Fish','photo-1476224203421-9ac39bcb3327'],
  ['Beans & Fried Plantain','photo-1498837167922-ddd27525d352'],
  ['Yam Porridge','photo-1525351484163-7529414344d8'],
  ['Tuwo Shinkafa & Miyan Kuka','photo-1466637574441-749b8f19452f'],
  ['Miyan Taushe & Tuwo','photo-1551218808-94e220e084d2'],
  ['Moi Moi','photo-1576618148400-f54bed99fcfd'],
  ['Akara & Pap','photo-1606787366850-de6330128bfc'],
  ['Egusi Soup & Eba','photo-1559847844-5315695dadae'],
  ['Okra Soup & Semovita','photo-1631515243349-e0cb75fb8d3a'],
  ['Efo Riro & Pounded Yam','photo-1585937421612-70a008356fbe'],
  ['Afang Soup & Fufu','photo-1589302168068-964664d93dc0'],
  ['Goat Meat Pepper Soup','photo-1569718212165-3a8278d5f624'],
  ['Beef Suya','photo-1544025162-d76694265947'],
  ['Grilled Tilapia','photo-1600891964599-f61ba0e24092'],
  ['Peppered Turkey','photo-1626082927389-6cd097cdc6ec'],
  ['Puff Puff','photo-1621996346565-e3dbc646d9a9'],
  ['Chicken Shawarma','photo-1528735602780-2552fd46c7af'],
  ['Fresh Zobo','photo-1470337458703-46ad1756a187'],
  ['Chapman','photo-1514362545857-3bc16c4c7d1b'],
  ['Pineapple Juice','photo-1543255006-d6395b6f1171']
];
const updateMenuImage = db.prepare('UPDATE menu_items SET image=? WHERE name=?');
db.transaction(() => menuImages.forEach(([name, imageId]) => {
  updateMenuImage.run(`https://images.unsplash.com/${imageId}?auto=format&fit=crop&w=900&q=85`, name);
}))();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('tiny'));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

const money = n => `₦${Number(n).toLocaleString('en-NG')}`;
const paystackHeaders = () => ({ Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' });

app.get('/api/config', (req,res) => res.json({ paystackPublicKey: PAYSTACK_PUBLIC_KEY, whatsappNumber: WHATSAPP_NUMBER, restaurantName: "Katuka's Kitchen" }));
app.get('/api/menu', (req,res) => {
  const { category, featured } = req.query; let q = 'SELECT * FROM menu_items WHERE available=1'; const p=[];
  if(category && category !== 'All'){ q += ' AND category=?'; p.push(category); } if(featured==='1') q += ' AND featured=1'; q += ' ORDER BY featured DESC, category, name';
  res.json(db.prepare(q).all(...p));
});

const orderSchema = z.object({customerName:z.string().min(2).max(80),phone:z.string().min(7).max(30),email:z.string().email().optional().or(z.literal('')),orderType:z.enum(['pickup','delivery']),address:z.string().max(250).optional(),notes:z.string().max(500).optional(),items:z.array(z.object({id:z.number().int().positive(),qty:z.number().int().min(1).max(20)})).min(1)}).superRefine((data,ctx)=>{if(data.orderType==='delivery'&&!data.address?.trim())ctx.addIssue({code:z.ZodIssueCode.custom,path:['address'],message:'A delivery address is required.'})});
function createOrder(data){
  const ids=data.items.map(x=>x.id); const rows=db.prepare(`SELECT * FROM menu_items WHERE available=1 AND id IN (${ids.map(()=>'?').join(',')})`).all(...ids);
  if(rows.length!==new Set(ids).size) throw new Error('One or more menu items are unavailable.');
  const map=new Map(rows.map(x=>[x.id,x])); let total=0; for(const i of data.items) total += map.get(i.id).price*i.qty;
  const tx=db.transaction(()=>{ const r=db.prepare('INSERT INTO orders(customer_name,phone,email,order_type,address,notes,total) VALUES(?,?,?,?,?,?,?)').run(data.customerName,data.phone,data.email||'',data.orderType,data.address||'',data.notes||'',total); const ins=db.prepare('INSERT INTO order_items(order_id,item_id,name,qty,price) VALUES(?,?,?,?,?)'); data.items.forEach(i=>ins.run(r.lastInsertRowid,i.id,map.get(i.id).name,i.qty,map.get(i.id).price)); return Number(r.lastInsertRowid); });
  return { id: tx(), total };
}
app.post('/api/orders', async (req,res) => {
  const parsed=orderSchema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:'Please check the order details.'});
  try { const o=createOrder(parsed.data); res.status(201).json({orderId:o.id,total:o.total,money:money(o.total),status:'pending',paymentStatus:'unpaid'}); } catch(e) { res.status(400).json({error:e.message}); }
});

app.post('/api/payments/initialize', async (req,res) => {
  if(!PAYSTACK_SECRET_KEY) return res.status(503).json({error:'Online payments are not configured yet.'});
  const schema=z.object({orderId:z.number().int().positive(),email:z.string().email(),callbackUrl:z.string().url().optional()}); const p=schema.safeParse(req.body); if(!p.success) return res.status(400).json({error:'Valid order ID and email are required.'});
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(p.data.orderId); if(!order) return res.status(404).json({error:'Order not found.'}); if(order.payment_status==='paid') return res.status(409).json({error:'This order is already paid.'});
  const body={email:p.data.email,amount:String(order.total*100),currency:'NGN',reference:`KATUKA-${order.id}-${Date.now()}`,metadata:{orderId:order.id,customerName:order.customer_name},callback_url:p.data.callbackUrl || undefined};
  try { const r=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:paystackHeaders(),body:JSON.stringify(body)}); const j=await r.json(); if(!r.ok||!j.status) return res.status(502).json({error:j.message||'Paystack could not initialize payment.'}); db.prepare('UPDATE orders SET payment_reference=? WHERE id=?').run(body.reference,order.id); res.json({authorizationUrl:j.data.authorization_url,accessCode:j.data.access_code,reference:body.reference,publicKey:PAYSTACK_PUBLIC_KEY}); } catch(e){res.status(502).json({error:'Payment service is temporarily unavailable.'});}
});
app.get('/api/payments/verify/:reference', async (req,res) => {
  if(!PAYSTACK_SECRET_KEY) return res.status(503).json({error:'Online payments are not configured yet.'});
  try { const r=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(req.params.reference)}`,{headers:paystackHeaders()}); const j=await r.json(); if(!r.ok||!j.status) return res.status(502).json({error:j.message||'Could not verify payment.'}); const paid=j.data.status==='success'; const order=db.prepare('SELECT * FROM orders WHERE payment_reference=?').get(req.params.reference); if(order && paid) db.prepare("UPDATE orders SET payment_status='paid',paid_at=CURRENT_TIMESTAMP,status=CASE WHEN status='pending' THEN 'confirmed' ELSE status END WHERE id=?").run(order.id); res.json({paid,reference:req.params.reference,amount:j.data.amount,currency:j.data.currency,orderId:order?.id||null}); } catch(e){res.status(502).json({error:'Payment verification failed.'});}
});

const reservationSchema=z.object({name:z.string().min(2).max(80),phone:z.string().min(7).max(30),email:z.string().email().optional().or(z.literal('')),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string().regex(/^\d{2}:\d{2}$/),guests:z.number().int().min(1).max(20),notes:z.string().max(500).optional()});
app.post('/api/reservations',(req,res)=>{const p=reservationSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Please check your reservation details.'});const d=p.data;const exists=db.prepare("SELECT id FROM reservations WHERE date=? AND time=? AND status!='cancelled'").get(d.date,d.time);if(exists)return res.status(409).json({error:'That time is already requested. Please choose another time.'});const r=db.prepare('INSERT INTO reservations(name,phone,email,date,time,guests,notes) VALUES(?,?,?,?,?,?,?)').run(d.name,d.phone,d.email||'',d.date,d.time,d.guests,d.notes||'');res.status(201).json({reservationId:Number(r.lastInsertRowid),status:'pending'});});

function admin(req,res,next){if(req.header('x-admin-key')!==ADMIN_KEY)return res.status(401).json({error:'Unauthorized'});next();}
app.get('/api/admin/menu',admin,(req,res)=>res.json(db.prepare('SELECT * FROM menu_items ORDER BY category,name').all()));
app.get('/api/admin/stats',admin,(req,res)=>{const stats=db.prepare(`SELECT (SELECT COUNT(*) FROM orders) orders,(SELECT COUNT(*) FROM orders WHERE date(created_at)=date('now','localtime')) todayOrders,(SELECT COALESCE(SUM(total),0) FROM orders WHERE payment_status='paid') revenue,(SELECT COUNT(*) FROM reservations WHERE status='pending') pendingReservations,(SELECT COUNT(*) FROM menu_items WHERE available=1) activeMenu`).get();res.json(stats);});
app.get('/api/admin/orders',admin,(req,res)=>res.json(db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all()));
app.get('/api/admin/order-items/:id',admin,(req,res)=>res.json(db.prepare('SELECT * FROM order_items WHERE order_id=?').all(req.params.id)));
app.get('/api/admin/reservations',admin,(req,res)=>res.json(db.prepare('SELECT * FROM reservations ORDER BY date DESC,time DESC').all()));
app.patch('/api/admin/orders/:id',admin,(req,res)=>{const allowed=['pending','confirmed','preparing','ready','completed','cancelled'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid status'});db.prepare('UPDATE orders SET status=? WHERE id=?').run(req.body.status,req.params.id);res.json({ok:true});});
app.patch('/api/admin/reservations/:id',admin,(req,res)=>{const allowed=['pending','confirmed','seated','completed','cancelled'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid status'});db.prepare('UPDATE reservations SET status=? WHERE id=?').run(req.body.status,req.params.id);res.json({ok:true});});
app.patch('/api/admin/menu/:id',admin,(req,res)=>{if(typeof req.body.available!=='boolean')return res.status(400).json({error:'available must be boolean'});db.prepare('UPDATE menu_items SET available=? WHERE id=?').run(req.body.available?1:0,req.params.id);res.json({ok:true});});
app.get('/api/health',(req,res)=>res.json({ok:true,service:"Katuka's Kitchen",time:new Date().toISOString(),paymentConfigured:Boolean(PAYSTACK_SECRET_KEY)}));
app.get('/admin', (req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/menu', (req,res)=>res.sendFile(path.join(__dirname,'public','menu.html')));
app.get('/about', (req,res)=>res.sendFile(path.join(__dirname,'public','about.html')));
app.get('/reviews', (req,res)=>res.sendFile(path.join(__dirname,'public','reviews.html')));
app.get('/reservations', (req,res)=>res.sendFile(path.join(__dirname,'public','reservations.html')));
app.get('/{*splat}',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`Katuka's Kitchen running on http://localhost:${PORT}`));
