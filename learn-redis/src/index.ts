import express from 'express';
import axios from 'axios';
import Redis from 'ioredis';
import http from 'http';
import { Server } from 'socket.io';

const app = express(); // Express Server

const redis = new Redis({ host: 'localhost', port: Number(6379) });
const publisher = new Redis({ host: 'localhost', port: Number(6379) });
const subscriber = new Redis({ host: 'localhost', port: Number(6379) });


// interface cacheStore {
//   totalPageCount: number;
// }

// const cacheStore: cacheStore = { 

// // Clear, LRU(Least Recent Use), Server Crash, New Set of Problems
// // It can be solved by using Redis

//   totalPageCount: 0
// }

// Creating an http server
const httpServer = http.createServer(app); 
// Http Server (Express Server ko mount kardiya http pr)

//////////////////////////////////////////
// Socket
const io = new Server(); // Socket Server
io.attach(httpServer);

const stateKey = 'state1';

redis.setnx(stateKey, JSON.stringify(new Array(100).fill(false)));

subscriber.subscribe('server:broker');
subscriber.on('message', (channel, message) => {
  const { event, data } = JSON.parse(message);

  io.emit(event, data); // Relay kardo
});

// Socket Events: Client to Server
io.on('connection', (socket) => {
  console.log(`Socket Connected`, socket.id);

  // Socket Events: Server to Client
  socket.on('message', (msg) => {
    io.emit('server-message', msg); // Broadcast to all the connected clients
  });

  // Update the state
  socket.on('checkbox-update', async (data) => {
    const state = await redis.get(stateKey);

    if (state) {
      const parsedState = JSON.parse(state);
      parsedState[data.index] = data.value;
      await redis.set(stateKey, JSON.stringify(parsedState));
    }

    await publisher.publish(
      'server:broker',
      JSON.stringify({ event: 'checkbox-update', data })
    );
  });
});
//////////////////////////////////////////////////////////

const PORT = process.env.PORT ?? 8000;

app.use(express.static('./public'));

/////////////////////////////////////////
// Global Rate Limit
app.use(async function (req, res, next) {
  const key = 'rate-limit';

  // rate limit per ip
  // const key = `rate-limit:${req.ip}`

  // rate limit per user
  // const key = `rate-limit:${req.user.id}`

  const value = await redis.get(key);

  if (value === null) {
    await redis.set(key, 0);
    await redis.expire(key, 60); // expire key in 60 seconds
  }

  if (Number(value) > 100) {
    return res.status(429).json({ message: 'Too Many Requests' });
  }

  await redis.incr(key); // increase key value by 1
  next();
});
/////////////////////////////////////////////////

// GET /state
app.get('/state', async (req, res) => {
  const state = await redis.get(stateKey);

  if (state) {
    const parsedState = JSON.parse(state);
    console.log({ parsedState });
    return res.json({ state: parsedState });
  }
  return res.json({ state: [] });
});

// GET /
app.get('/', (req, res) => {
  return res.json({ status: 'success' });
});

// GET /books
app.get('/books', async (req, res) => {
  const response = await axios.get(
    'https://api.freeapi.app/api/v1/public/books'
  );
  return res.json(response.data);
});

// GET /books/total
app.get('/books/total', async (req, res) => {

  // Check Cache Value in Redis
  const cachedValue = await redis.get('totalPageValue');
  if (cachedValue) {
    console.log(`Cache Hit`); // Cache mein mil gaya
    return res.json({ totalPageCount: Number(cachedValue) });
  }
  
  // if (cacheStore.totalPageCount) {
  //   console.log(`Cache Hit`); // Cache mein mil gaya
  //   return res.json({ totalPageCount: Number(cachedValue) });
  // }

  const response = await axios.get(
    'https://api.freeapi.app/api/v1/public/books'
  );

  // Calculate Total Page Count
  const totalPageCount = response?.data?.data?.data?.reduce(
    (acc: number, curr: { volumeInfo?: { pageCount?: number } }) =>
      !curr.volumeInfo?.pageCount ? 0 : curr.volumeInfo.pageCount + acc,
    0
  );

  // Set Cache Value in Redis
  await redis.set('totalPageValue', totalPageCount);

  console.log(`Cache Miss`); // Cache mein nahi mila
  return res.json({ totalPageCount });
});

// Start Server
httpServer.listen(PORT, () =>
  console.log(`HTTP Server is Running on PORT ${PORT}`)
);
// we will not use app.listen()
// app.listen(PORT, () => console.log(`HTTP Server is Running on PORT ${PORT}`));
