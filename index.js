const express = require("express");
const cors = require("cors");
const app = express();
const dotenv = require("dotenv").config();
const bodypareser = require("body-parser");
const port = 4000;
const path = require("path");
const { google } = require("googleapis");
const { default: axios } = require("axios");
const fs = require("fs");
const session = require("express-session");
const { IgApiClient } = require("instagram-private-api");
const { get } = require("request-promise");
const multer = require("multer");
const { Console } = require("console");
// Hello Rishabh 
app.use(bodypareser.json());

app.use(cors());

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

// const imageStorage = multer.diskStorage({
//   // Destination to store image
//   destination: "public",
//   filename: (req, file, cb) => {
//     cb(
//       null,
//       file.fieldname + "_" + Date.now() + path.extname(file.originalname)
//     );
//     // file.fieldname is name of the field (image)
//     // path.extname get the uploaded file extension
//   },
// });

// const imageUpload = multer({
//   storage: imageStorage,
//   limits: {
//     fileSize: 1000000,
//   },
//   fileFilter(req, file, cb) {
//     if (!file.originalname.match(/\.(png|jpg)$/)) {
//       // upload only png and jpg format
//       return cb(new Error("Please upload a Image"));
//     }
//     cb(undefined, true);
//   },
// });

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

app.post("/connect-instagram", async (req, res) => {
  const { username, password } = req.body;
  ig.state.generateDevice(username);
  try {
    const data = await ig.account.login(username, password);
    res.send(data);
  } catch (error) {
    console.log(error);
    res.status(500).json(error);
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
  const { media, caption, tags } = req.body;

  try {
    const mediaBuffer = Buffer.from(media, "base64");

    // const imageBuffer = await get({
    //   url: "https://picsum.photos/200",
    //   encoding: null,
    // });

    const data = await ig.publish.photo({
      file: mediaBuffer,
      caption: caption + " #" + tags.join(" #"),
    });
    res.send(data.media);
  } catch (error) {
    res.status(500).json(error.message);
  }
});

app.post("/upload-instagram-video", async (req, res) => {
  // const { media, caption, tags } = req.body;

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/kaustubh_desphande_12/media`,
      {
        access_token: process.env.meta_access_token,
        caption: "New Video",
        media_type: "REELS",
        video_url: "./temp2.mp4",
        // cover_url: coverUrl,
      }
    );
    res.send(response.data);
  } catch (error) {
    res.status(500).json(error);
  }
});

app.get("/get-instagram-posts", async (req, res) => {
  try {
    const currentUser = await ig.user.info(ig.state.cookieUserId);
    const userId = currentUser.pk;

    const feed = await ig.feed.user(userId);

    const posts = await feed.items();

    const postData = [];
    posts.forEach((post) => {
      const { user, caption, like_count, comment_count, share_count } = post;
      const username = user.username;
      const profilePicUrl = user.profile_pic_url;
      const imageUrls = post.image_versions2?.candidates
        .map((candidate, index) => index % 2 == 0 && candidate.url)
        .filter(Boolean);

      const captionText = caption?.text;

      const tags = captionText.match(/#[^\s#]+/g) || [];

      postData.push({
        username,
        tags,
        imageUrls,
        profilePicUrl,
        like_count,
        comment_count,
        share_count,
      });
    });
    res.send(postData);
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json(error);
  }
});

app.post("/post-feed-facebook", async (req, res) => {
  const response = await axios.post(
    `https://graph.facebook.com/v19.0/214846575048732/photos?access_token=${process.env.meta_access_token}`,
    {
      url: req.body.media.url,
    },
    {
      "Content-Type": "application/json",
    }
  );
  res.send(response.data);
});

app.post("/post-photo-facebook", async (req, res) => {
  try {
    const url = req.body.url;
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/214846575048732/photos?access_token=${process.env.meta_access_token}&url=${url}`,

      {
        "Content-Type": "application/json",
      }
    );
    res.send(response.data);
  } catch (e) {
    res.status(500).json(e);
  }
});

app.post("/post-video-facebook", async (req, res) => {
  var stats = fs.statSync(req.body.url);
  // console.log(req.body);
  var fileSizeInBytes = stats.size;
  console.log(fileSizeInBytes);
  const response = await axios.post(
    `https://graph.facebook.com/v19.0/214846575048732/videos?upload_phase=start&access_token=${process.env.meta_access_token}&file_size=${fileSizeInBytes}`,
    {
      url: req.body.url,
    },
    {
      "Content-Type": "application/json",
    }
  );

  const { upload_session_id, start_offset } = response.data;

  const responseChunk = await axios.post(
    `https://graph.facebook.com/v19.0/214846575048732/videos?upload_phase=transfer&access_token=${process.env.meta_access_token}&upload_session_id=${upload_session_id}&start_offset=${start_offset}&video_file_chunk='abcd'`,
    // {
    //   url: req.body.url,
    // },
    {
      "Content-Type": "application/json",
    }
  );
  // {page-id}/videos
  // ?upload_phase=transfer
  // &access_token={access-token}
  // &upload_session_id={upload-session-id}
  // &start_offset={start-offset}
  // &video_file_chunk={video-file-chunk}
  res.send(response.data);
});

app.get("/get-facebook-posts", async (req, res) => {
  const response = await axios.get(
    `https://graph.facebook.com/v19.0/214846575048732/feed?access_token=${process.env.meta_access_token}&fields=message,full_picture,likes.limit(1).summary(true),comments.limit(1).summary(true),shares`
  );
  res.send(response.data);
});

app.all("*", (req, res) => {
  res.status(404).json({ message: "Route Not Found" });
});

app.listen(port, () => {
  console.log("We are live on port 4000");
});
