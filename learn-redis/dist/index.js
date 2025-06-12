"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const ioredis_1 = __importDefault(require("ioredis"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const app = (0, express_1.default)(); // Express Server
const redis = new ioredis_1.default({ host: 'localhost', port: Number(6379) });
const publisher = new ioredis_1.default({ host: 'localhost', port: Number(6379) });
const subscriber = new ioredis_1.default({ host: 'localhost', port: Number(6379) });
const httpServer = http_1.default.createServer(app); // Http Server (Express Server ko mount kardiya http pr)
const io = new socket_io_1.Server(); // Socket Server
io.attach(httpServer);
const stateKey = 'state1';
redis.setnx(stateKey, JSON.stringify(new Array(100).fill(false)));
subscriber.subscribe('server:broker');
subscriber.on('message', (channel, message) => {
    const { event, data } = JSON.parse(message);
    io.emit(event, data); // Relay kardo
});
io.on('connection', (socket) => {
    console.log(`Socket Connected`, socket.id);
    socket.on('message', (msg) => {
        io.emit('server-message', msg); // Broadcast to all the connected clients
    });
    socket.on('checkbox-update', (data) => __awaiter(void 0, void 0, void 0, function* () {
        const state = yield redis.get(stateKey);
        if (state) {
            const parsedState = JSON.parse(state);
            parsedState[data.index] = data.value;
            yield redis.set(stateKey, JSON.stringify(parsedState));
        }
        yield publisher.publish('server:broker', JSON.stringify({ event: 'checkbox-update', data }));
    }));
});
const PORT = (_a = process.env.PORT) !== null && _a !== void 0 ? _a : 8000;
app.use(express_1.default.static('./public'));
app.use(function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = 'rate-limit';
        const value = yield redis.get(key);
        if (value === null) {
            yield redis.set(key, 0);
            yield redis.expire(key, 60);
        }
        if (Number(value) > 100) {
            return res.status(429).json({ message: 'Too Many Requests' });
        }
        yield redis.incr(key);
        next();
    });
});
app.get('/state', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const state = yield redis.get(stateKey);
    if (state) {
        const parsedState = JSON.parse(state);
        console.log({ parsedState });
        return res.json({ state: parsedState });
    }
    return res.json({ state: [] });
}));
app.get('/', (req, res) => {
    return res.json({ status: 'success' });
});
app.get('/books', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield axios_1.default.get('https://api.freeapi.app/api/v1/public/books');
    return res.json(response.data);
}));
app.get('/books/total', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    // Check Cache
    const cachedValue = yield redis.get('totalPageValue');
    if (cachedValue) {
        console.log(`Cache Hit`);
        return res.json({ totalPageCount: Number(cachedValue) });
    }
    const response = yield axios_1.default.get('https://api.freeapi.app/api/v1/public/books');
    const totalPageCount = (_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.reduce((acc, curr) => { var _a; return !((_a = curr.volumeInfo) === null || _a === void 0 ? void 0 : _a.pageCount) ? 0 : curr.volumeInfo.pageCount + acc; }, 0);
    yield redis.set('totalPageValue', totalPageCount);
    console.log(`Cache Miss`);
    return res.json({ totalPageCount });
}));
httpServer.listen(PORT, () => console.log(`HTTP Server is Running on PORT ${PORT}`));
