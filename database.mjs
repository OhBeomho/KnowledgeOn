import { config } from "dotenv"
config()

const { DB_URL } = process.env
import pg from "pg"
const { Client } = pg
const db = new Client(DB_URL)

try {
	await db.connect()
	await db.query(
		"CREATE TABLE IF NOT EXISTS question(id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT, answers INTEGER[] DEFAULT '{}', chose INTEGER DEFAULT -1, writer_id TEXT NOT NULL, write_date TEXT NOT NULL)"
	)
	await db.query(
		"CREATE TABLE IF NOT EXISTS answer(id SERIAL PRIMARY KEY, content TEXT NOT NULL, writer_id TEXT NOT NULL, write_date TEXT NOT NULL)"
	)
	await db.query(
		"CREATE TABLE IF NOT EXISTS account(id TEXT PRIMARY KEY, password TEXT NOT NULL, join_date TEXT NOT NULL, answer_count INTEGER DEFAULT 0, question_count INTEGER DEFAULT 0)"
	)
} catch (error) {
	console.error(error)
	process.exit(1)
}

export class Account {
	static async id_check(id) {
		const { rows } = await db.query("SELECT id FROM account WHERE id = $1", [id])
		return { unique: rows[0] === undefined }
	}

	static async get(id) {
		const { rows } = await db.query(
			"SELECT id, join_date, answer_count, question_count FROM account WHERE id = $1",
			[id]
		)

		return rows[0]
	}

	static async sign_up(id, password) {
		await db.query("INSERT INTO account (id, password, join_date) VALUES($1, $2, $3)", [
			id,
			password,
			new Date().toLocaleDateString("ko-KR")
		])
	}

	static async login(id, password) {
		const { rows } = await db.query("SELECT password FROM account WHERE id = $1", [id])

		const account = rows[0]
		if (!account) return "NOT_EXISTS"
		else if (account.password !== password) return "INCORRECT_PASSWORD"
	}

	static async delete(id, password) {
		const { rows } = await db.query("SELECT password FROM account WHERE id = $1", [id])

		const account = rows[0]
		if (!account) return "NOT_EXISTS"
		else if (account.password !== password) return "INCORRECT_PASSWORD"

		await db.query("DELETE FROM account WHERE id = $1", [id])
		await db.query(`UPDATE question SET writer_id = '${'-'.repeat(30)}' WHERE writer_id = $1`, [id])
		await db.query(`UPDATE answer SET writer_id = '${'-'.repeat(30)}' WHERE writer_id = $1`, [id])
	}
}

export class Question {
	static async list(page) {
		const { rows } = await db.query(
			"SELECT id, title, writer_id, write_date, answers, chose FROM question ORDER BY id DESC OFFSET $1 LIMIT 20",
			[page * 20]
		)

		return rows
	}

	static async get(user_id, question_id) {
		const { rows } = await db.query("SELECT * FROM question WHERE id = $1", [question_id])

		const question = rows[0]
		if (!question) return "NOT_EXISTS"

		const answers = await Answer.array(question.answers)
		if (answers === -1) return -1

		question.answers = answers
		question.is_writer = question.writer_id === user_id
		return question
	}

	static async choose_answer(question_id, answer_id) {
		await db.query("UPDATE question SET chose = $1 WHERE id = $2", [answer_id, question_id])
	}

	static async write(writer_id, title, content) {
		const { rows } = await db.query(
			"INSERT INTO question(title, content, writer_id, write_date) VALUES($1, $2, $3, $4) RETURNING id",
			[title, content, writer_id, new Date().toLocaleDateString("ko-KR")]
		)

		const question_id = rows[0].id
		await db.query("UPDATE account SET question_count = question_count + 1 WHERE id = $1", [writer_id])

		return question_id
	}

	static async delete(question_id) {
		const { rows } = await db.query("DELETE FROM question WHERE id = $1 RETURNING answers", [question_id])
		await db.query("DELETE FROM answer WHERE id = ANY($1)", [rows[0].answers])
	}
}

export class Answer {
	static async write(writer_id, question_id, content) {
		const { rows } = await db.query(
			"INSERT INTO answer(content, writer_id, write_date) VALUES($1, $2, $3) RETURNING id",
			[content, writer_id, new Date().toLocaleDateString("ko-KR")]
		)
		await db.query("UPDATE question SET answers = array_append(answers, $1) WHERE id = $2", [
			rows[0].id,
			question_id
		])
		await db.query("UPDATE account SET answer_count = answer_count + 1 WHERE id = $1", [writer_id])
	}

	static async array(answer_id_array) {
		const { rows } = await db.query("SELECT * FROM answer WHERE id = ANY($1)", [answer_id_array])
		return rows
	}
}
