require('dotenv').config()

const PORT = process.env.PORT || 8000

const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.PG_CONNECTION_STRING, ssl: true })

const ws = require('ws')

const clients = {}

const wss = new ws.Server(
    {
        port: PORT,
    },
    () => {
        console.log('OK!')
    }
)

wss.on('connection', (ws) => {
    const id = Math.random()
    clients[id] = {
        client: ws,
    }

    ws.on('message', (message) => {
        message = JSON.parse(message)
        switch (message.event) {
            case 'connection':
                clients[id].nickname = message.nickname
                onConnect(ws, message.nickname)
                break
            case 'message':
                (async () => {
                    await sendMessage(message)
                    Object.keys(clients).forEach(async (key) => {
                        onConnect(clients[key].client, clients[key].nickname)
                    })
                })()
                break
        }
    })
})

async function onConnect(client, nickname) {
    const messages = await getUserMessages(nickname)
    const users = await getAllUsers()
    const result = { users, messages }
    broadcastMessage(client, result)
}

function broadcastMessage(client, message) {
    client.send(JSON.stringify(message))
}

async function getAllUsers() {
    const recipients = (await pool.query('SELECT DISTINCT recipient FROM messages')).rows.map((v) => v.recipient)
    const senders = (await pool.query('SELECT DISTINCT sender FROM messages')).rows.map((v) => v.sender)
    const result = new Set([...recipients, ...senders])
    return Array.from(result)
}

async function getUserMessages(nickname) {
    const results = await pool.query(
        'SELECT *, (EXTRACT(epoch FROM date) * 1000) AS date FROM messages WHERE recipient = $1 OR sender = $1',
        [nickname]
    )
    return results?.rows
}

async function sendMessage(message) {
    const results = await pool.query(`INSERT INTO messages (sender, recipient, title, body) VALUES ($1, $2, $3, $4)`, [
        message.sender,
        message.recipient,
        message.title,
        message.body,
    ])
    return results
}
