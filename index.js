import express from "express";

const app = express();
const port = 3000;

app.use(express.static("public"));

app.get("/",(req,res)=>{
    res.render("index.ejs");
});

app.get("/history",(req,res)=>{
    res.render("history.ejs");
});

app.get("/cropdetail",(req,res)=>{
    res.render("cropdetails.ejs");
});

app.get("/settings",(req,res)=>{
    res.render("settings.ejs");
});
app.get("/consumerhome",(req,res)=>{
    res.render("consumerhome.ejs");
});
app.get("/consumerrequest",(req,res)=>{
    res.render("C-request.ejs");
});
app.get("/consumersetting",(req,res)=>{
    res.render("user-settings.ejs");
});
app.listen(port, () => {
    console.log(`API is running at http://localhost:${port}`);
});
