const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// --- MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Koi direct URL se .html na khol paye
app.use((req, res, next) => {
    if (req.path.includes('.html')) return res.redirect('/');
    next();
});

// --- 1. CLOUDINARY CONFIGURATION ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- 2. STORAGE SETUP (Cloudinary Folder) ---
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'Kushwaha_Vault_Docs',
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'webp'],
        format: 'pdf', // 🔥 Magic: Koi bhi photo ab automatic PDF ban jayegi!
        transformation: [
            { width: 1500, crop: "limit" }, // Jyada badi file ko resize karega
            { effect: "improve" }, // Scanner jaisa clear/enhance karega
            { effect: "sharpen:100" } // Text ko ekdum sharp karega
        ]
    },
});
const upload = multer({ storage: storage });

// --- 2.5 STORAGE SETUP (Cloudinary Avatars) ---
const avatarStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'Kushwaha_Vault_Avatars',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    },
});
const uploadAvatar = multer({ storage: avatarStorage });

// --- 3. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Family Vault: Database Connected!"))
    .catch(err => console.log("DB Connection Error: ", err));

// --- 4. SCHEMAS (Database Structure) ---

// Member Schema (Profiles)
const memberSchema = new mongoose.Schema({
    name: String,      // Asli Naam
    nickname: String,  // Golu, Bade, etc.
    avatar: String,    // Pehla Letter
    faceData: [Number], // NAYA: AI Facial Data
    profilePic: { type: String, default: '' }, // NAYA: Asli Face Photo
    customNames: { type: Map, of: String, default: {} } // Private Nicknames Map
});
const Member = mongoose.model('Member', memberSchema);

// Document Schema (Files)
const docSchema = new mongoose.Schema({
    ownerNickname: { type: String, index: true }, // ⚡ Index for blazing fast search
    docName: String,
    category: { type: String, default: 'Other' }, // Smart Categories
    docNumber: { type: String, default: '' }, // One-Click Copy Number
    expiryDate: { type: Date, default: null }, // Expiry Alert Date
    fileUrl: String,
    isDeleted: { type: Boolean, default: false, index: true }, // ⚡ Index for fast filtering
    uploadDate: { type: Date, default: Date.now }
});
const Document = mongoose.model('Document', docSchema);

// Intruder Schema (Chor pakadne ke liye)
const intruderSchema = new mongoose.Schema({
    attemptedName: String,
    photoUrl: String,
    timestamp: { type: Date, default: Date.now }
});
const Intruder = mongoose.model('Intruder', intruderSchema);

// Activity Log Schema (Vault ki History)
const logSchema = new mongoose.Schema({
    message: String,
    timestamp: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', logSchema);

// Helper function: Log save karne ke liye
async function addLog(msg) {
    await new Log({ message: msg }).save();
}

// --- 5. ROUTES (Raaste) ---

// A. Login/Home Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// B. Secure Dashboard
app.get('/dashboard', (req, res) => {
    if (req.cookies.auth === 'verified') {
        res.sendFile(path.join(__dirname, 'public', 'views', 'dashboard.html'));
    } else {
        res.redirect('/');
    }
});

// B2. Secure Admin Panel (Sirf PIN walo ke liye)
app.get('/admin', (req, res) => {
    if (req.cookies.auth === 'verified' && req.cookies.role === 'admin') {
        res.sendFile(path.join(__dirname, 'public', 'views', 'admin.html'));
    } else {
        res.redirect('/');
    }
});

// C. Secure Profile Page
app.get('/profile', (req, res) => {
    if (req.cookies.auth === 'verified') {
        res.sendFile(path.join(__dirname, 'public', 'views', 'profile.html'));
    } else {
        res.redirect('/');
    }
});

// D. API: Login Process (.env ke PIN se match karega)
app.post('/api/login', (req, res) => {
    const correctPin = String(process.env.ADMIN_PIN).split('#')[0].trim();
    const inputPin = String(req.body.pin).trim();
    if (inputPin === correctPin) {
        res.cookie('auth', 'verified', { httpOnly: true }); 
        res.cookie('role', 'admin', { httpOnly: true }); // 🔥 Yahan admin ki chabhi deni zaroori hai
        res.json({ success: true, stealth: false });
    } else {
        // 🔥 ANY WRONG PIN / LETTER: Fake Login (Stealth Mode) + Picture Capture
        res.cookie('auth', 'verified', { httpOnly: true }); 
        res.cookie('role', 'stealth', { httpOnly: true }); // 🕵️‍♂️ STEALTH MODE
        res.json({ success: true, stealth: true });
    }
});

// E. API: Saare Members fetch karna (With Doc Count)
app.get('/api/members', async (req, res) => {
    try {
        if (req.cookies.role === 'stealth') return res.json([]); // Stealth mode mein sab gayab!
        const currentUser = req.cookies.user || 'admin';
        const members = await Member.find({});
        const membersWithCounts = await Promise.all(members.map(async (m) => {
            const count = await Document.countDocuments({ ownerNickname: m.nickname, isDeleted: false });
            const obj = m.toObject();
            let dName = obj.name;
            if (obj.customNames && obj.customNames[currentUser]) dName = obj.customNames[currentUser];
            return { ...obj, displayName: dName, docCount: count };
        }));
        res.json(membersWithCounts);
    } catch (err) {
        res.status(500).json({ error: "Profiles nahi mil rahi hain." });
    }
});

// E2. API: Auto Face ID Login (Bina naam select kiye chehra pehchane)
app.post('/api/face-login', async (req, res) => {
    const { descriptor } = req.body;
    
    // Saare members ko bulao jinka face data save hai
    const members = await Member.find({ faceData: { $exists: true, $not: {$size: 0} } });
    
    let bestMatch = null;
    let bestDistance = 0.62; // 🔥 Threshold badha diya gaya hai taaki alag lighting mein bhi aasani se pehchan le

    for (const member of members) {
        const distance = Math.sqrt(member.faceData.reduce((sum, val, i) => sum + Math.pow(val - descriptor[i], 2), 0));
        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = member;
        }
    }

    if (bestMatch) {
        res.cookie('auth', 'verified', { httpOnly: true });
        res.cookie('role', 'member', { httpOnly: true }); // Normal member ki chabhi
        res.cookie('user', bestMatch.nickname, { httpOnly: true });
        res.json({ success: true, message: "Face Matched!", nickname: bestMatch.nickname, name: bestMatch.name });
    } else {
        res.json({ success: false, message: "Chehra Match Nahi Hua!" });
    }
});

// F. API: Naya Member Add karna
app.post('/add-member', async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ success: false, message: "Unauthorized" });
    try {
        const { name, descriptor, profilePic } = req.body;
        const nickname = name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now(); // Unique ID

        // 🛑 DUPLICATE FACE CHECK
        const allMembers = await Member.find({ faceData: { $exists: true, $not: {$size: 0} } });
        for(let m of allMembers) {
            const distance = Math.sqrt(m.faceData.reduce((sum, val, i) => sum + Math.pow(val - descriptor[i], 2), 0));
            if(distance <= 0.62) return res.status(400).json({success: false, message: `Yeh chehra pehle se '${m.name}' ke naam se save hai!`});
        }

        const newMember = new Member({
            name,
            nickname,
            avatar: name.charAt(0).toUpperCase(),
            faceData: descriptor,
            profilePic: profilePic || '',
            customNames: {}
        });
        await newMember.save();
        await addLog(`New profile created: ${name}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: "Member add nahi ho paya." }); }
});

// F1.5 API: Profile aur Nickname Update Karna (Files Transfer ke sath)
app.put('/api/members/:oldNickname', async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ success: false });
    try {
        const oldNick = req.params.oldNickname;
        const { customName } = req.body;
        const currentUser = req.cookies.user || 'admin';

        const member = await Member.findOne({ nickname: oldNick });
        if (!member) return res.status(404).json({ success: false, message: "Member nahi mila!" });

        // Private nickname map update karein
        if (!member.customNames) member.customNames = new Map();
        member.customNames.set(currentUser, customName);
        await member.save();

        await addLog(`Profile custom name set by user`);
        res.json({ success: true, message: "Profile Updated!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// F2. API: Admin dwara Member ka Face Data save karna
app.post('/api/register-face', async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ success: false });

    const descriptor = req.body.descriptor;
    const allMembers = await Member.find({ faceData: { $exists: true, $not: {$size: 0} } });
    for(let m of allMembers) {
        const distance = Math.sqrt(m.faceData.reduce((sum, val, i) => sum + Math.pow(val - descriptor[i], 2), 0));
        if(distance <= 0.62) return res.status(400).json({success: false, message: `Yeh chehra pehle se '${m.name}' ke naam se save hai!`});
    }

    await Member.findOneAndUpdate({ nickname: req.body.nickname }, { faceData: req.body.descriptor, profilePic: req.body.profilePic });
    res.json({ success: true, message: "Face Data successfully saved!" });
});

// F3. API: Chor (Intruder) ki photo save karna
app.post('/api/report-intruder', upload.single('photo'), async (req, res) => {
    const newIntruder = new Intruder({
        attemptedName: req.body.attemptedName || "Unknown Face",
        photoUrl: req.file.path
    });
    await newIntruder.save();
    console.log("🚨 INTRUDER ALERT: Ek anjaan chehre ne login try kiya!");
    res.json({ success: true });
});

// H2. API: Security ke liye role check karna
app.get('/api/check-role', (req, res) => {
    res.json({ role: req.cookies.role || 'none' });
});

// G. API: PHOTO UPLOAD ROUTE
app.post('/api/upload', upload.single('document'), async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ success: false, message: "Unauthorized!" });
    try {
        const { nickname, docName, category, docNumber, expiryDate } = req.body;
        
        const newDoc = new Document({
            ownerNickname: nickname,
            docName: docName,
            category: category || 'Other',
            docNumber: docNumber || '',
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            fileUrl: req.file.path // Cloudinary ka link
        });

        await newDoc.save();
        await addLog(`Document '${docName}' uploaded to ${nickname}'s vault`);
        res.json({ success: true, message: "Cloudinary par save ho gaya!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Upload fail ho gaya." });
    }
});

// H. API: Kisi member ke docs fetch karna
app.get('/api/docs/:nickname', async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ error: "Unauthorized" });
    const docs = await Document.find({ ownerNickname: req.params.nickname, isDeleted: false });
    res.json(docs);
});

// I. API: Document Delete karna
app.delete('/api/docs/:id', async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ success: false, message: "Unauthorized!" });
    try {
        // 1. Sabse pehle database se document dhoondhein taaki uska URL mil sake
        const doc = await Document.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: "Document nahi mila!" });

        // 2. URL se Cloudinary ka 'public_id' nikalna (Jaise: Kushwaha_Vault_Docs/xyz_file)
        const urlParts = doc.fileUrl.split('/');
        const folderAndFile = urlParts.slice(-2).join('/'); // Last ke 2 hisse: folder aur file name
        const publicId = folderAndFile.replace(/\.[^/.]+$/, ""); // Extension (.jpg/.png) hata dena

        // 3. Cloudinary API se asli image ko permanently destroy (delete) karna
        await cloudinary.uploader.destroy(publicId);

        // 4. Ab safely Database se entry delete kar dena
        await Document.findByIdAndDelete(req.params.id);
        await addLog(`A document was permanently deleted from the vault`);
        
        res.json({ success: true, message: "Cloudinary aur DB dono se hamesha ke liye delete ho gaya!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Delete request failed." });
    }
});

// J. API: Profile aur uske saare Documents ko delete karna
app.delete('/api/members/:nickname', async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ success: false, message: "Unauthorized!" });
    try {
        const nickname = req.params.nickname;

        // 1. Is sadasya ke saare documents dhoondho
        const docs = await Document.find({ ownerNickname: nickname });

        // 2. Cloudinary se saari photos permanently delete karo
        for (let doc of docs) {
            const urlParts = doc.fileUrl.split('/');
            const folderAndFile = urlParts.slice(-2).join('/');
            const publicId = folderAndFile.replace(/\.[^/.]+$/, "");
        try {
            await cloudinary.uploader.destroy(publicId);
        } catch(e) { console.log("Cloudinary image missing, proceeding with DB deletion."); }
        }

        // 3. Database se iske saare documents delete karo
        await Document.deleteMany({ ownerNickname: nickname });

        // 4. Aakhir mein Member ki profile (Card) ko delete karo
        await Member.findOneAndDelete({ nickname: nickname });
        await addLog(`Profile '${nickname}' and all associated documents were deleted`);

        res.json({ success: true, message: "Profile aur saare documents hamesha ke liye delete ho gaye!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Profile delete nahi ho payi." });
    }
});

// K. API: Logout (Vault Lock Karna)
app.get('/api/logout', (req, res) => {
    res.clearCookie('auth');
    res.json({ success: true, message: "Vault locked" });
});

// L. API: Recent Documents fetch karna
app.get('/api/recent-docs', async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ error: "Unauthorized" });
    try {
        // Sabse naye 5 documents dhoondho (uploadDate ke hisaab se descending order)
        const recentDocs = await Document.find({ isDeleted: false }).sort({ uploadDate: -1 }).limit(5);
        res.json(recentDocs);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch recent documents." });
    }
});

// L2. API: Saare Documents fetch karna (Full Backup ke liye)
app.get('/api/all-docs', async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ error: "Unauthorized" });
    try {
        const docs = await Document.find({ isDeleted: false });
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch all documents." });
    }
});

// M. API: Intruders Fetch karna (Admin ke liye)
app.get('/api/intruders', async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ error: "Unauthorized" });
    const intruders = await Intruder.find({}).sort({ timestamp: -1 });
    res.json(intruders);
});

// M2. API: Intruder delete karna (Admin)
app.delete('/api/intruders/:id', async (req, res) => {
    if (req.cookies.auth !== 'verified' || req.cookies.role !== 'admin') return res.status(403).json({ success: false });
    try {
        const intruder = await Intruder.findById(req.params.id);
        if (intruder) {
            const urlParts = intruder.photoUrl.split('/');
            const publicId = urlParts.slice(-2).join('/').replace(/\.[^/.]+$/, "");
            try { await cloudinary.uploader.destroy(publicId); } catch(e) {}
            await Intruder.findByIdAndDelete(req.params.id);
        }
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

// N. API: Activity Logs fetch karna (Terminal ke liye)
app.get('/api/logs', async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json([]);
    const logs = await Log.find({}).sort({ timestamp: -1 }).limit(8);
    res.json(logs);
});

// O. API: Recycle Bin (Admin Only)
app.get('/api/bin', async (req, res) => {
    if (req.cookies.role !== 'admin') return res.status(403).json([]);
    const docs = await Document.find({ isDeleted: true }).sort({ uploadDate: -1 });
    res.json(docs);
});
app.put('/api/bin/restore/:id', async (req, res) => {
    if (req.cookies.role !== 'admin') return res.status(403).json({ success: false });
    await Document.findByIdAndUpdate(req.params.id, { isDeleted: false });
    await addLog(`A document was restored from Recycle Bin`);
    res.json({ success: true });
});
app.delete('/api/bin/permanent/:id', async (req, res) => {
    if (req.cookies.role !== 'admin') return res.status(403).json({ success: false });
    const doc = await Document.findById(req.params.id);
    if (doc) {
        const urlParts = doc.fileUrl.split('/');
        const publicId = urlParts.slice(-2).join('/').replace(/\.[^/.]+$/, "");
        try { await cloudinary.uploader.destroy(publicId); } catch(e) {}
        await Document.findByIdAndDelete(req.params.id);
        await addLog(`A document was permanently deleted`);
    }
    res.json({ success: true });
});

// P. API: Upload Profile Picture (Avatar) Gallery se
app.post('/api/upload-avatar', uploadAvatar.single('avatar'), async (req, res) => {
    if (req.cookies.auth !== 'verified') return res.status(403).json({ success: false, message: "Unauthorized!" });
    try {
        const nickname = req.body.nickname;
        
        // Purani photo cloudinary se delete karein (storage bachane ke liye)
        const member = await Member.findOne({ nickname: nickname });
        if (member && member.profilePic && member.profilePic.includes('Kushwaha_Vault_Avatars')) {
            try {
                const publicId = member.profilePic.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, "");
                await cloudinary.uploader.destroy(publicId);
            } catch(e) {}
        }

        await Member.findOneAndUpdate({ nickname: nickname }, { profilePic: req.file.path });
        res.json({ success: true, message: "Profile picture updated!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Upload failed." });
    }
});

// --- 6. SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Jarvis is live on http://localhost:${PORT}`);
});