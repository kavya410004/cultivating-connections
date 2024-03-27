import express from "express";

const app = express();
const port = 3000;

app.use(express.static("public"));

app.get("/",(req,res)=>{
    res.render("register.ejs");
});

app.get("/farmer-home", (req,res) => {
    res.render("index.ejs");
});

app.get("/sold-crops",(req,res)=>{
    res.render("sold-crops.ejs");
});

app.get("/crop-details",(req,res)=>{
    res.render("crop-details.ejs");
});

app.get("/farmer-settings",(req,res)=>{
    res.render("farmer-settings.ejs");
});
app.get("/buyer-home",(req,res)=>{
    res.render("buyer-home.ejs");
});
app.get("/buyer-requests",(req,res)=>{
    res.render("buyer-requests.ejs");
});
app.get("/buyer-settings",(req,res)=>{
    res.render("buyer-settings.ejs");
});
app.get("/loginpage",(req,res)=>{
    res.render("login.ejs");
});
app.get("/registerpage",(req,res)=>{
    res.render("register.ejs");
});


app.post("/farmerRegister",(req,res) => {
    res.render("index.ejs");
});

app.post("/buyerRegister",(req,res) => {
    res.render("buyer-home.ejs");
});

app.listen(port, () => {
    console.log(`API is running at http://localhost:${port}`);
});