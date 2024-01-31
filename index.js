const express = require("express");
const cors = require("cors");
const app = express();
const dotenv = require("dotenv").config();
const port = 4000;
const path = require("path");
const { google } = require("googleapis");
const { default: axios } = require("axios");
const fs = require("fs");
const session = require("express-session");
const { IgApiClient } = require("instagram-private-api");
const { get } = require("request-promise");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: ["http://localhost:5173"],
  })
);
app.use(
  session({
    secret: "HACKS_TSEC_CAPSLOCK", // Change this to a strong, random string
    resave: false,
    saveUninitialized: true,
  })
);

const oauth2Client = new google.auth.OAuth2(
  process.env.client_id,
  process.env.client_secret,
  process.env.redirect_uris
);
const ig = new IgApiClient();

async function ConnectInsta() {
  ig.state.generateDevice(process.env.IG_USERNAME);
  const res = await ig.account.login(
    process.env.IG_USERNAME,
    process.env.IG_PASSWORD
  );
  return res;
}
ConnectInsta().then((res) => {});

try {
  const creds = fs.readFileSync("creds.json");
  oauth2Client.setCredentials(JSON.parse(creds));
} catch (err) {
  console.log("No creds found");
}

const scopes = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.channel-memberships.creator",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtubepartner",
  "https://www.googleapis.com/auth/youtubepartner-channel-audit",
];

app.get("/get-youtube-authorizationurl", async (req, res) => {
  let authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    include_granted_scopes: true,
  });

  res.send(authorizationUrl);
});

app.post("/get-youtube-auth-code", async (req, res) => {
  const { code } = req.body;
  try {
    let { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    try {
      fs.writeFileSync("creds.json", JSON.stringify(tokens));
    } catch (error) {
      res.status(400).json(error.message);
    }
    res.status(200).json({ message: "Authentication Successfull" });
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.post("/upload-youtube-video", async (req, res) => {
  try {
    if (oauth2Client.credentials.access_token) {
      const youtube = google.youtube({
        version: "v3",
        auth: oauth2Client,
      });
      const videoMetadata = {
        snippet: {
          title: "My village video",
          description: "fishes playing in water",
          tags: ["tag1", "tag2"],
          // moderationStatus: "heldForReview",
        },
        status: {
          privacyStatus: "public",
        },
      };

      const videoPath = "./temp2.mp4";
      console.log(videoMetadata);
      try {
        const res = await youtube.videos.insert({
          part: "snippet,status",
          resource: videoMetadata,
          media: {
            body: fs.createReadStream(videoPath),
          },
        });
        console.log("Reel posted on YouTube:", res.data);
      } catch (err) {
        console.error("Error posting reel on YouTube:", err);
      }

      res.status(201).json({ videoData: res.data });
    } else {
      res.status(401).json({ message: "Not Authenticated" });
    }
  } catch (e) {
    res.status(500).json(e.message);
  }
});

app.post("/upload-instagram-post", async (req, res) => {
  try {
    const imageBuffer = await get({
      url: "https://picsum.photos/id/1/200/300",
      encoding: null,
    });

    const data = await ig.publish.photo({
      file: imageBuffer,
      caption: "Really nice photo from the internet!",
    });
    res.send(data.media);
  } catch (error) {
    res.status(500).json(error.message);
  }
});

app.all("*", (req, res) => {
  res.status(404).json({ message: "Route Not Found" });
});

app.listen(port, () => {
  console.log("We are live on port 4000");
});
