const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

// Authentication with JWT Token
const authenticateToken = async (request, response, next) => {
  const head = request.headers;
  const token = head["authorization"];
  if (!token) {
    response.status(401);
    response.send("Invalid JWT Token");
    return;
  }
  const authorize = token.split(" ");
  if (authorize.length !== 2) {
    response.status(401);
    response.send("Invalid JWT Token");
    return;
  }
  const result = authorize[1];
  if (!result) {
    response.status(401);
    response.send("Invalid JWT Token");
    return;
  }
  jwt.verify(result, "MY_Secret_Token", (error, payload) => {
    if (error) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      request.userId = payload.userId;
      next();
    }
  });
};

// API 1
app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const query = `select * from user where username = '${username}';`;
  const user = await db.get(query);
  if (user !== undefined) {
    response.status(400);
    response.send("User already exists");
    return;
  }
  if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
    return;
  }
  const pass = await bcrypt.hash(password, 10);
  const register = `insert into user (username,password,name,gender) values
  ('${username}','${pass}','${name}','${gender}');`;
  await db.run(register);
  response.status(200);
  response.send("User created successfully");
});

// API 2
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const query = `select * from user where username = '${username}';`;
  const result = await db.get(query);
  if (result === undefined) {
    response.status(400);
    response.send("Invalid user");
    return;
  }
  const pass = await bcrypt.compare(password, result.password);
  const payload = {
    userId: result.user_id,
    username: username,
  };
  if (pass === true) {
    const jwtToken = await jwt.sign(payload, "MY_Secret_Token");
    response.send({ jwtToken });
  } else {
    response.status(400);
    response.send("Invalid password");
  }
});

// API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const tweetsQuery = `SELECT
            user.username, tweet.tweet, tweet.date_time AS dateTime
            FROM
            follower
             INNER JOIN tweet
              ON follower.following_user_id = tweet.user_id
              INNER JOIN user
               ON tweet.user_id = user.user_id
             WHERE
              follower.follower_user_id = ${userId}
             ORDER BY
             tweet.date_time DESC
             LIMIT 4;`;
  const result = await db.all(tweetsQuery);
  response.send(result);
});

// API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const query = `select name from (select following_user_id from
user inner join follower on user.user_id = follower.follower_user_id where user_id = ${userId}) as T inner join user on user.user_id = T.following_user_id;`;
  const result = await db.all(query);
  response.send(result);
});

// API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const query = `select name from (select follower_user_id from
user inner join follower on user.user_id = follower.following_user_id where user_id = ${userId}) as T inner join user on user.user_id = T.follower_user_id;`;
  const result = await db.all(query);
  response.send(result);
});

// API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const query = `select tweet,
  (select count(*) from like where tweet_id =3) as likes,
(select count(*) from reply where tweet_id =3) as replies,
date_time as dateTime
from tweet
where tweet_id = ${tweetId} and user_id in (select following_user_id from follower where follower_user_id = ${userId});`;
  const result = await db.get(query);
  if (result === undefined) {
    response.status(401);
    response.send("Invalid Request");
    return;
  } else {
    response.send(result);
  }
});

// API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const query1 = `select tweet_id from tweet where tweet_id = ${tweetId} and user_id in (select following_user_id from follower where follower_user_id = ${userId})`;
    const result1 = await db.get(query1);
    if (result1 === undefined) {
      response.status(401);
      response.send("Invalid Request");
      return;
    }
    const query2 = `select user.username from like inner join user on like.user_id = user.user_id where like.tweet_id = ${tweetId};`;
    const result2 = await db.all(query2);
    response.send({
      likes: result2.map((each) => each.username),
    });
  }
);

// API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const query1 = `select * from tweet where tweet_id = ${tweetId} and user_id in (select following_user_id from follower where follower_user_id = ${userId});`;
    const result1 = await db.get(query1);
    if (result1 === undefined) {
      response.status(401);
      response.send("Invalid Request");
      return;
    }
    const query2 = `select name, reply from reply inner join user on reply.user_id = user.user_id where reply.tweet_id = ${tweetId};`;
    const result2 = await db.all(query2);
    response.send({
      replies: result2,
    });
  }
);

// API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const query = `select tweet,
(select count(*) from reply where reply.tweet_id=tweet.tweet_id) as replies,
(select count(*) from like where like.tweet_id=tweet.tweet_id) as likes,
date_time as dateTime from tweet where user_id = ${userId};`;
  const result = await db.all(query);
  response.send(result);
});

// API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const query = `insert into tweet (tweet,user_id,date_time) values ('${tweet}',${request.userId}
  ,datetime("now"));`;
  await db.run(query);
  response.send("Created a Tweet");
});

// API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const query = `select * from tweet where tweet_id = ${tweetId} and user_id = ${userId};`;
    const result = await db.get(query);
    if (result === undefined) {
      response.status(401);
      response.send("Invalid Request");
      return;
    }
    const query2 = `delete from tweet where tweet_id = ${tweetId};`;
    await db.run(query2);
    response.send("Tweet Removed");
  }
);

module.exports = app;
