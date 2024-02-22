import express from "express";

const app = express();
const port = 3000;

app.use(express.static("public"));
app.listen(port, () => {
    console.log(`API is running at http://localhost:${port}`);
});

app.get("/",(req,res)=>{
    res.render("index.ejs");
});