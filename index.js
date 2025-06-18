import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import {Strategy} from "passport-local";
import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import env from "dotenv";

const app = express();
const port = 3000;
env.config();
const saltRounds = parseInt(process.env.SALT_ROUNDS);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
      cb(null, 'public/uploads/'); // Destination folder for uploads
  },
  filename: function (req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname)); // File naming
  }
});
const upload = multer({storage: storage});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const db = new pg.Client({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT,
});
db.connect();


// after session use passport
app.use(passport.initialize());
app.use(passport.session());

// ============================== FARMER FUNCTIONS ==============================
// add the crop details of new crop for sale in database
async function addCropDetails(name, quantity, price, imagePath,farmerPhoneNumber){
  const date = new Date();
  let day = date.getDate();
  let month = date.getMonth() + 1;
  let year = date.getFullYear();
  let currentDate = `${day}-${month}-${year}`;
  let dbImagePath = imagePath.slice(7);
  await db.query("INSERT INTO crops(crop_name, crop_price, crop_quantity,crop_listed_on, crop_image_path,farmer_phone_number) VALUES ($1, $2, $3, TO_DATE($4, 'DD-MM-YYYY') , $5, $6);",[
    name,
    parseFloat(price),
    parseInt(quantity),
    currentDate,
    dbImagePath,
    farmerPhoneNumber
  ]);
  const imageBuffer = fs.readFileSync(imagePath);
  try {
    const croppedImageBuffer = await sharp(imageBuffer)
      .resize({ width: 1000, height: 500, fit: 'cover' })
      .toBuffer();
    fs.writeFileSync(imagePath, croppedImageBuffer);
  } catch (err) {
    console.log('Error cropping image:', err);
  }
  return;
}
//get the all crop details of the farmer from database and return the object
async function getAllCropsDetails(farmerPhoneNumber){
  console.log("Getting crop details of ", farmerPhoneNumber);
  const result = await db.query("SELECT farmers.phone_number, farmers.name_ AS farmer_name, farmers.district,crops.crop_id, crops.crop_name, crops.crop_price, crops.crop_quantity,TO_CHAR(crops.crop_listed_on, 'DD-MM-YYYY') AS date, crops.crop_image_path FROM crops INNER JOIN farmers ON crops.farmer_phone_number = farmers.phone_number WHERE crops.farmer_phone_number=$1 AND (crops.crop_quantity > 0 OR crops.crop_id IN (SELECT crop_id FROM requests WHERE request_status='P'))ORDER BY date DESC;",[
    farmerPhoneNumber 
  ]);
  if(result.rows.length>0){
    return result.rows;
  }else{
    return -1;
  }
}
// get the details of a specific crop
async function getCropDetails(cropId){
  const result = await db.query("SELECT crop_id, crop_name, crop_price, crop_quantity,TO_CHAR(crop_listed_on, 'DD-MM-YYYY') AS date, crop_image_path FROM crops WHERE crop_id = $1;",[
    cropId
  ]);
  if(result.rows.length>0){
    return result.rows[0];
  }else{
    return -1;
  }
}
// get all the pending requests for a crop
async function getCropRequests(cropId){
  const result = await db.query("SELECT B.request_id, B.request_quantity, D.name_ AS buyer_name FROM requests B JOIN buyers D ON B.buyer_phone_number = D.phone_number AND B.crop_id = $1 AND B.request_status='P'ORDER BY B.request_id DESC;",[
    cropId
  ]);
  if(result.rows.length>0){
    return result.rows;
  }else{
    return -1;
  }
}
// accept a request: update the crop quantity and request status
async function acceptRequest(requestId){
  const result1 = await db.query("SELECT request_quantity,crop_id FROM requests WHERE request_id = $1",[
    requestId
  ]);
  let requestedQuantity = result1.rows[0].request_quantity;
  let cropId = result1.rows[0].crop_id;
  const result2 = await db.query("SELECT crop_quantity FROM crops WHERE crop_id=$1",[
    cropId
  ]);
  let cropQuantity = result2.rows[0].crop_quantity;
  const newQuantity = cropQuantity - requestedQuantity;
  //update crop quantity
  try{
    await db.query("UPDATE crops SET crop_quantity=$1 WHERE crop_id = $2;",[
      newQuantity,
      cropId
    ]);
    await db.query("UPDATE requests SET request_status='A' WHERE request_id=$1",[
      requestId
    ]);
    return 1;
  }catch(err){
    console.log("Error in accepting the request.",err);
    return -1;
  }

}
// reject request
async function rejectRequest(requestId){
  await db.query("UPDATE requests SET request_status='R' WHERE request_id=$1",[
    requestId
  ]);
  return;
}
// get all sold crops
async function getAcceptedRequests(farmerPhoneNumber){
  const result = await db.query("SELECT R.request_id, R.request_quantity, C.crop_name, C.crop_price,B.name_ AS buyer_name FROM requests R JOIN buyers B ON R.buyer_phone_number = B.phone_number JOIN crops C ON R.crop_id = C.crop_id WHERE R.request_status = 'A' AND C.crop_id IN(SELECT crop_id FROM crops WHERE farmer_phone_number=$1)ORDER BY R.request_id DESC;;",[
    farmerPhoneNumber
  ]);
  if(result.rows.length > 0){
    return  result.rows;
  }else{
    return -1;
  }
}
// edit the crop quantity if the farmer has sold the crop outside the website
async function editCropQuantity(cropId, newQuantity){
  const result = await db.query("UPDATE crops SET crop_quantity=$1 WHERE crop_id=$2 RETURNING *;",[
    newQuantity,
    cropId
  ]);
  if(result.rows.length > 0){
    return true;
  }else{
    return false;
  }
}

// ============================== BUYER FUNCTIONS ==============================
// to get the search results
async function getSearchResults(searchString){
  const result = await db.query("SELECT * FROM (SELECT crops.crop_id, crops.crop_name, crops.crop_price, crops.crop_quantity, TO_CHAR(crops.crop_listed_on, 'DD-MM-YYYY') AS date, crops.crop_image_path, farmers.name_ AS farmer_name, farmers.district FROM crops INNER JOIN farmers ON crops.farmer_phone_number = farmers.phone_number) AS B WHERE B.crop_name ILIKE '%' || $1 || '%' AND B.crop_quantity > 0 ORDER BY B.date DESC; ", [searchString]);
  if(result.rows.length > 0){
    return result.rows;
  }else{
    return -1;
  }
}
// to request for a crop to buy
async function sendRequest(cropId, quantity, buyerPhoneNumber){
  const result = await db.query("INSERT INTO requests(request_quantity,buyer_phone_number, crop_id) VALUES($1,$2,$3) RETURNING *;",[
    parseInt(quantity),
    buyerPhoneNumber,
    parseInt(cropId)
  ]);
  return;
}
// If the requested quantity is valid
async function isValidRequestQuantity(cropId, quantity){
  const availableQuantity = await db.query("SELECT crop_price FROM crops WHERE crop_id = $1",[
    cropId
  ]);
  if(quantity > 0 && quantity <= availableQuantity){
    return true;
  }else{
    return false;
  }
}
// Gets the requests of buyer
async function getRequestsSent(buyerPhoneNumber){
  const result = await db.query("	SELECT R.request_id,R.request_quantity,R.request_status, C.crop_id,C.crop_name, C.crop_price FROM requests R JOIN crops C ON R.crop_id = C.crop_id	WHERE R.buyer_phone_number = $1 ORDER BY R.request_id DESC;;",[
    buyerPhoneNumber
  ]);
  if(result.rows.length>0){
    return result.rows;
  }else{
    return -1;
  }
}
// Get farmer phno
async function getFarmerContactInfo(cropId){
  const result = await db.query("SELECT F.name_, F.phone_number FROM farmers F join crops C ON F.phone_number=C.farmer_phone_number WHERE C.crop_id = $1;",[
    cropId
  ]);
  if(result.rowCount > 0){
    return result.rows[0];
  }else{
    return -1;
  }
}

app.get("/",(req,res)=>{
    res.render("buyer-home.ejs");
});

app.get("/login",(req,res)=>{
    res.render("login.ejs");
});
app.get("/register",(req,res)=>{
    res.render("register.ejs");
});
app.get("/farmer-home", async (req,res) => {
    console.log("In /farmer-home" ,req.user);
    if(req.isAuthenticated() && req.user.type === "farmer"){
      const cropList = await getAllCropsDetails(req.user.phone_number);
      console.log(cropList);
      res.render("farmer-home.ejs",{
        "crops" : cropList
    });
    }else{
        res.redirect("/login");
    }
});
app.get('/logout', (req, res) => {
    req.logout(() => {
      res.redirect('/'); 
    });
});

// ============================== FARMER ROUTES ==============================
// Farmer GET requests
app.get("/sold-crops",async (req,res)=>{
    console.log("In sold-crops",req.user);
    if(req.isAuthenticated() && req.user.type === "farmer"){
      try{
        const acceptedRequests = await getAcceptedRequests(req.user.phone_number);
        res.render("sold-crops.ejs",{
          "requests":acceptedRequests
        });
      }catch(err){
        console.log("error fetching accepted requests : ", err);
        res.render("sold-crops.ejs",{
          "errorMessage": "Error in retrieving sold crops detais. Please try again later."
        })
      }
    }else{
        res.redirect("/login");
    }
});
app.get("/farmer-settings",async (req,res)=>{
    console.log("In farmer-settings",req.user);
    if(req.isAuthenticated() && req.user.type === "farmer"){
        res.render("farmer-settings.ejs",{
            "farmer": req.user
        });
    }else{
        res.redirect("/login");
    }
});
app.get('/crop-details/:cropId',async (req, res) => {
  if(req.isAuthenticated()  && req.user.type == "farmer"){
    const cropId = req.params.cropId;
    try{
      const cropDetails = await getCropDetails(cropId);
      const cropRequests = await getCropRequests(cropId);
      // console.log(cropRequests);
      if(cropDetails != -1){
        res.render("crop-details.ejs", { 
          "crop": cropDetails,
          "requests" : cropRequests
        });
      }else{
        res.redirect("/farmer-home");
      }
    }catch(err){
      console.log("Error fetching crop's details: ", err);
      res.redirect("/farmer-home");
    }
  }else{
    res.redirect("/login");
  }
});
app.get("/accept/:requestId", async (req,res) => {
  if(req.isAuthenticated() && req.user.type === "farmer"){
    let requestId=req.params.requestId;
    try{
      const result = await acceptRequest(requestId);
      if(result === -1){
        res.redirect("/farmer-home");
      }else{
        res.redirect("/sold-crops");
      }
    }catch(err){
      console.log("Error accepting request(fetching the data): ",err);
      res.redirect("/farmer-home");
    }
  }else{
    res.redirect("/login");
  }
});
app.get("/reject/:requestId", async (req,res) => {
  if(req.isAuthenticated() && req.user.type === 'farmer'){
    let requestId = req.params.requestId;
    try{
      await rejectRequest(requestId);
      res.redirect("/farmer-home");
    }catch(err){
      console.log("error rejecting request");
      res.redirect("/farmer-home");
    }
  }else{
    res.redirect("login");
  }
})
// Farmer POST requests
app.post("/edit-farmer-details", async (req,res) => {
  console.log("In edit-farmer-details POST",req.user);
  if(req.isAuthenticated() && req.user.type === "farmer"){
      console.log(req.body);
      const user = req.user;
      try{
          const user = req.user;
          const phno = user.phone_number;
          let formInput = req.body;
          if(formInput.farmerName){
              await db.query("UPDATE farmers SET name_ = $1 WHERE phone_number=$2",[formInput.farmerName, phno]);
              user.name_ = formInput.farmerName;
          }
          if(formInput.district){
              await db.query("UPDATE farmers SET district = $1 WHERE phone_number=$2",[formInput.district, phno]);
              user.district = formInput.district;                
          }
          req.user = user;
          res.redirect("/farmer-settings");
      }catch(err){
          console.log("Error in finding the user or updating details.",err);
          res.redirect("/farmer-home");
      }
  }else{
      res.redirect("/login");
  }
});
app.post("/add-crop", upload.single('cropImage'),async (req, res) => {
if(req.isAuthenticated() && req.user.type === "farmer"){
  try{
    console.log("req.file.path",req.file.path);
    await addCropDetails(req.body.cropName, req.body.cropQuantity, req.body.pricePerKg, req.file.path, req.user.phone_number);
    res.redirect("/farmer-home");
  }catch(err){
    console.log("Error adding crops : ", err);
    res.redirect("/farmer-home");
  }
}else{
  res.redirect("/");
}
});
app.post("/edit-quantity/:cropId", async (req,res) => {
if(req.isAuthenticated() && req.user.type === 'farmer'){
  let cropId = req.params.cropId;
  let newQuantity = req.body.updatedQuantity;
  const isQuantityUpdated = await editCropQuantity(cropId, newQuantity);
  if(isQuantityUpdated){
    res.redirect('/crop-details/' +  cropId);
  }else{
    res.redirect("/farmer-home");
  }
}
});

// ============================== BUYER ROUTES ==============================
// Buyer GET requests
app.get("/buyer-home",(req,res)=>{
    console.log("In buyer-home",req.user);
    if(req.isAuthenticated() && req.user.type === "buyer"){
        res.render("buyer-home.ejs",{
            "isLoggedIn" : true
        });
    }else{
        res.render("buyer-home.ejs",{
            "isLoggedIn": false
        });
    }
});
app.get("/buyer-requests",async (req,res)=>{
  console.log("In buyer-requests",req.user);
  if(req.isAuthenticated() && req.user.type === "buyer"){
    try{
      const requestsList = await getRequestsSent(req.user.phone_number);
      res.render("buyer-requests.ejs",{
        "isLoggedIn" : true,
        "requests" :  requestsList
      });
    }catch(err){
      console.log("Error fetching user's previous requests : ", err);
      res.render("buyer-requests.ejs",{
        "isLoggedIn" : true
      });
    }
  }else{
    res.redirect("/login");
  }
});
app.get("/buyer-settings",(req,res)=>{
    console.log("In buyer-settings",req.user);
    if(req.isAuthenticated() && req.user.type === "buyer"){
        res.render("buyer-settings.ejs",{
            "isLoggedIn" : true,
            "buyer" : req.user
        });
    }else{
        res.redirect("/login");
    }
});
app.get("/connect/:cropId",async (req,res) =>{
  if(req.isAuthenticated() && req.user.type === 'buyer'){
    let  cropId=req.params.cropId;
    try{
      const farmerDetails = await getFarmerContactInfo(cropId);
      if(farmerDetails != -1){
        res.render("contact.ejs",{
          "farmer": farmerDetails,
          "isLoggedIn" : true
        });
      }else{
        res.render("contact.ejs",{
          "errorMessage": "There was an error in retrieving the farmers contact information.",
          "isLoggedIn" : true
        });
      }
    }catch(err){
      console.log("Error fetching farmers phone number :" , err);
      res.redirect("/buyer-requests");
    }
  }else{
    res.redirect("/login");
  }
});
// Buyer POST requests
app.post("/buyer-settings",async (req, res) => {
  console.log("In change-buyer-password POST",req.user);
  if(req.isAuthenticated() && req.user.type === "buyer"){
      console.log(req.body);
      // checking validity of password
      if(req.body.password1 === req.body.password2){
        const newPassword = req.body.password1;
        const phno = req.user.phone_number;
      // hashing and updating the new password
      bcrypt.hash(newPassword, saltRounds, async (err, hash) => {
          if(err){
            console.log("Error hashing new password at registration:", err);
            res.render("buyer-settings.ejs",{
                "errorMessage":"Failed to change password.",
                "isLoggedIn" : true,
                "buyer" : req.user
            });
          }else{
            await db.query("UPDATE buyers SET buyer_password=$1 WHERE phone_number=$2",[
              hash,
              phno
            ]);
            res.render("buyer-settings.ejs",{
                "successMessage":"Password Changed.",
                "isLoggedIn" : true,
                "buyer" : req.user
            });
          }
        });
      }else{
          res.render("buyer-settings.ejs",{
              "errorMessage":"Failed to change password. Entered passwords do not match.",
              "isLoggedIn" : true,
              "buyer" : req.user
          });
      }
  }else{
      res.redirect("/login"); 
  }
});
app.post("/search", async (req,res) => {
    const searchResults = await getSearchResults(req.body.searchText);
    if(req.isAuthenticated() && req.user.type == "buyer"){
      res.render("buyer-home.ejs",{
        "searchResults" :  searchResults,
        "isLoggedIn": true
      });
    }else{
      res.render("buyer-home.ejs",{
        "searchResults" :  searchResults,
        "isLoggedIn": false
      });
    }
    
});
app.post("/send-request/:cropId",async (req, res) => {
  if(req.isAuthenticated() && req.user.type === "buyer"){
    console.log(req.body);
    let cropId = req.params.cropId;
    let quantity = req.body.requestedQuantity;
    try{
      const isValid = await isValidRequestQuantity(cropId, quantity);
      if(isValid){
        try{
          await sendRequest(cropId, quantity, req.user.phone_number);
          res.redirect("/buyer-requests");
        }catch(err){
          console.log("Error requesting crop inside:", err);
          res.render("buyer-home.ejs",{
            "buyerErrorMessage": "Your request could not be sent, try again later. If the issue persists please contact support.",
            "isLoggedIn": true
          });
        }
      }else{
        res.render("buyer-home.ejs",{
          "buyerErrorMessage": "Entered quantity exceeds available quantity",
          "isLoggedIn": true
        });
      }
    }catch(err){
      console.log("Error requesting crop:", err);
      res.render("buyer-home.ejs",{
        "buyerErrorMessage": "Your request could not be sent, try again later. If the issue persists please contact support.",
        "isLoggedIn": true
      });
    }
  }else{
    res.redirect("/login");
  }
});

// Routes for register/login
app.post("/farmerRegister",async (req,res) => {
    console.log(req.body);
    let farmerDetails = req.body;
    if(farmerDetails.password1 === farmerDetails.password2){
        try{
            const result = await db.query("SELECT * FROM farmers WHERE farmers.phone_number=$1",[farmerDetails.phno]);
            console.log(result.rows.length);
            if(result.rows.length === 0 ){
                const originalPassword = farmerDetails.password1;
                bcrypt.hash(originalPassword, saltRounds, async (err, hash) => {
                    if (err) {
                      console.error("Error hashing password:", err);
                    } else {
                      console.log("Hashed Password:", hash);
                      try{
                        const insertedUser = await db.query(
                          "INSERT INTO farmers(name_,phone_number,district, farmer_password) VALUES ($1,$2,$3,$4) RETURNING *;", [
                              farmerDetails.farmerName,
                              farmerDetails.phno,
                              farmerDetails.district,
                              hash]
                        );
                        const user = insertedUser.rows[0];
                        user.type = "farmer";
                        console.log(user);
                        req.login(user,(err) => {
                          console.log("after const user: ",err);
                          res.redirect("/farmer-home");
                        });
                      }catch(err){
                        console.log("Error inserting  into farmers table: ", err);
                        res.render("register.ejs",{
                            "farmerErrorMessage" : "Check if your phone number is valid"
                        });
                      }
                    }
                  });
            }else{
                console.log("in else");
                res.render("register.ejs",{
                    "farmerErrorMessage" : "Account already exits for the entered phone number. Try logging in or use a different number"
                });
            }
        }catch(err){
            console.log("Error getting farmer details: ", err);
            res.render("register.ejs",{
                "farmerErrorMessage" : "Some error has occurred, please try again"
            });
        }
    }else{
        res.render("register.ejs",{
            "farmerErrorMessage" : "The two passwords do not match, enter the same password in both fields."
        });
    }
});
app.post("/buyerRegister",async (req,res) => {
    console.log(req.body);
    const buyerDetails = req.body;
    if(buyerDetails.password1 === buyerDetails.password2){
        try{
            const result = await db.query("SELECT * FROM buyers WHERE buyers.phone_number=$1",[buyerDetails.phno]);
            console.log(result.rows.length);
            if(result.rows.length === 0 ){
                const originalPassword = buyerDetails.password1;
                bcrypt.hash(originalPassword, saltRounds, async (err, hash) => {
                    if (err) {
                      console.error("Error hashing password:", err);
                    } else {
                      console.log("Hashed Password:", hash);
                      try{
                        const insertedUser = await db.query(
                          "INSERT INTO buyers(name_,phone_number, buyer_password) VALUES ($1,$2,$3) RETURNING *;", [
                              buyerDetails.buyerName,
                              buyerDetails.phno,
                              hash]
                        );
                        const user = insertedUser.rows[0];
                        user.type = "buyer";
                        console.log(user);
                        req.login(user,(err) => {
                          console.log("after const user: ",err);
                          res.redirect("/buyer-home");
                        });
                      }catch(err){
                        console.log("Error inserting  into buyers table: ", err);
                        res.render("register.ejs",{
                            "buyerErrorMessage" : "Check if your phone number is valid"
                        })
                      }
                    }
                  });
            }else{
                console.log("in else");
                res.render("register.ejs",{
                    "buyerErrorMessage" : "Account already exits for the entered phone number. Try logging in or use a different number"
                });
            }
        }catch(err){
            console.log("Error getting buyer details: ", err);
            res.render("register.ejs",{
                "buyerErrorMessage" : "Some error has occurred, please try again"
            });
        }
    }else{
        res.render("register.ejs",{
            "buyerErrorMessage" : "The two passwords do not match, enter the same password in both fields."
        });
    }
});
app.post("/login", (req, res, next) => {
    passport.authenticate(req.body.type, (err, user, info) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.render("login.ejs",{
            "loginErrorMessage" : "Invalid username or password!"
        });
      }
      req.login(user, (err) => {
        if (err) {
          return next(err);
        }
        if (req.body.type === 'farmer') {
          return res.redirect('/farmer-home');
        } else if (req.body.type === 'buyer') {
          return res.redirect('/buyer-home');
        }
      });
    })(req, res, next);
});

// passport for authentication
passport.use("farmer", new Strategy(async function verify(username, password, cb){
    console.log("In strategy farmer");
    console.log(username + " is trying to login.");
    console.log(password);
    try {
      const result = await db.query("SELECT * FROM farmers WHERE phone_number = $1", [
        username
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        user.type = "farmer";
        console.log(username);
        console.log(password);
        console.log(user);
        const storedHashedPassword = user.farmer_password;
        bcrypt.compare(password, storedHashedPassword, (err, result) => {
          if (err) {
            return cb(err);
          } else {
            if (result) {
              return cb(null, user);
            } else {
              return  cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found.");
      }
    } catch (err) {
      return cb(err);
    }
}));
passport.use("buyer", new Strategy(async function verify(username, password, cb){
    console.log("In strategy buyer");
    console.log(username + " is trying to login.");
    console.log(password);
    try {
      const result = await db.query("SELECT * FROM buyers WHERE phone_number = $1", [
        username
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        user.type = "buyer";
        console.log(username);
        console.log(password);
        console.log(user);
        const storedHashedPassword = user.buyer_password;
        bcrypt.compare(password, storedHashedPassword, (err, result) => {
          if (err) {
            return cb(err);
          } else {
            if (result) {
              return cb(null, user);
            } else {
              return  cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found.");
      }
    } catch (err) {
      return cb(err);
    }
}));
passport.serializeUser((user,cb) =>{
    cb(null,user);
});
passport.deserializeUser((user,cb) =>{
    cb(null,user);
});

app.listen(port, () => {
    console.log(`API is running at http://localhost:${port}`);
});