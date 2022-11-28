require("dotenv").config()

const express = require("express")
const app = express()
const http = require("http")
const server = http.createServer(app)
const { Client } = require("pg")
const db = new Client(process.env.DB_URL)
db.connect((err) => {
	if (err) {
		console.error(err.message)
		process.exit(1)
	}

	db.query(
		"CREATE TABLE IF NOT EXISTS question(id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT, answers INTEGER[] DEFAULT '{}', chose INTEGER DEFAULT -1, writer_id TEXT NOT NULL, write_date TEXT NOT NULL)"
	)
	db.query(
		"CREATE TABLE IF NOT EXISTS answer(id SERIAL PRIMARY KEY, content TEXT NOT NULL, writer_id TEXT NOT NULL, write_date TEXT NOT NULL)"
	)
	db.query(
		"CREATE TABLE IF NOT EXISTS account(id TEXT PRIMARY KEY, password TEXT NOT NULL, join_date TEXT NOT NULL, answer_count INTEGER DEFAULT 0, question_count INTEGER DEFAULT 0)"
	)
})

app.set("view engine", "ejs")
app.set("views", "src")
app.engine("html", require("ejs").renderFile)

app.use(express.static("src"))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(
	require("express-session")({
		secret: process.env.COOKIE_SECRET,
		resave: false,
		saveUninitialized: true
	})
)

// GET
app.get("/", (req, res) => {
	if (!req.session.user) {
		res.redirect("/login")
		return
	}

	const { page = 0 } = req.query
	db.query(
		"SELECT id, title, writer_id, write_date, answers, chose FROM question OFFSET $1 LIMIT 20",
		[page * 20],
		(err, result) => {
			if (err) {
				console.log(err.message)
				res.render("error", { message: "질문들을 불러오던 중 오류가 발생했습니다." })
			}

			res.render("index", { question_list: result.rows })
		}
	)
})
app.get("/login", (_, res) => res.render("login.html"))
app.get("/sign_up", (_, res) => res.render("signup.html"))
app.get("/id_check/:id", (req, res) => {
	const { id } = req.params

	db.query("SELECT id FROM account WHERE id = $1", [id], (err, result) => {
		if (err) {
			console.error(err.message)
			res.sendStatus(500)
		}

		res.send({ unique: result.rows[0] === undefined })
	})
})
app.get("/account", (req, res) => {
	if (!req.session.user) {
		res.redirect("/login")
		return
	}

	db.query(
		"SELECT id, join_date, answer_count, question_count FROM account WHERE id = $1",
		[req.session.user],
		(err, result) => {
			if (err) {
				console.error(err)
				res.render("error", { message: "계정 정보를 가져오던 중 오류가 발생했습니다." })
				return
			}

			const { id, join_date, answer_count, question_count } = result.rows[0]
			res.render("account", { id, join_date, answer_count, question_count })
		}
	)
})
app.get("/choose/:id/:answer_id", (req, res) => {
	const { id, answer_id } = req.params

	db.query("UPDATE question SET chose = $1 WHERE id = $2", [answer_id, id], (err) => {
		if (err) {
			console.error(err.message)
			res.render("error", { message: "서버에서 오류가 발생했습니다." })
		}
	})

	res.redirect("/read/" + id)
})
app.get("/logout", (req, res) => {
	if (req.session.user) req.session.destroy()
	res.redirect("/")
})
app.get("/delete/:password", (req, res) => {
	const { password } = req.params

	if (req.session.user) {
		let flag = true

		db.query("SELECT password FROM account WHERE id = $1", [req.session.user], (err, result) => {
			if (err) {
				console.error(err.message)
				res.render("error", { message: "계정을 삭제하던 중 오류가 발생했습니다." })
				flag = false
				return
			}

			if (result.rows[0].password !== password) {
				res.render("error", { message: "비밀번호가 일치하지 않습니다." })
				flag = false
				return
			}

			db.query("DELETE FROM account WHERE id = $1", [req.session.user], (err, result) => {
				if (err) {
					console.error(err.message)
					res.render("error", { message: "계정을 삭제하던 중 오류가 발생했습니다." })
					flag = false
					return
				} else if (!result.rows[0]) {
					res.render("error", { message: "존재하지 않는 계정입니다." })
					flag = false
					return
				}
			})
		})

		if (!flag) return
	} else {
		res.render("error", { message: "로그인 되어 있지 않습니다." })
		return
	}

	res.redirect("/logout")
})
app.get("/read/:id", (req, res) => {
	const { id } = req.params

	db.query("SELECT * FROM question WHERE id = $1", [id], (err, result) => {
		if (err) {
			console.error(err.message)
			res.render("error", { message: "질문 정보를 불러오던 중 오류가 발생했습니다." })
			return
		} else if (!result.rows[0]) {
			res.render("error", { message: "존재하지 않는 질문입니다." })
			return
		}

		const { id, title, content, answers, chose, writer_id, write_date } = result.rows[0]
		db.query(`SELECT * FROM answer WHERE id = ANY ($1)`, [answers], (err, result) => {
			if (err) {
				console.error(err.message)
				res.render("error", { message: "답변을 불러오던 중 오류가 발생했습니다." })
				return
			}

			res.render("read", {
				id,
				title,
				content,
				answers: result.rows,
				chose,
				writer_id,
				write_date,
				is_writer: writer_id === req.session.user
			})
		})
	})
})

// POST
app.post("/login", (req, res) => {
	const { id, password } = req.body

	db.query("SELECT password FROM account WHERE id = $1", [id], (err, result) => {
		if (err) {
			console.error(err.message)
			res.render("error", { message: "로그인을 하던 중 오류가 발생했습니다." })
			return
		}

		if (!result.rows[0]) {
			res.render("error", { message: "존재하지 않는 계정입니다." })
			return
		} else if (result.rows[0].password !== password) {
			res.render("error", { message: "비밀번호가 일치하지 않습니다." })
			return
		}

		req.session.user = id
		res.redirect("/")
	})
})
app.post("/sign_up", (req, res) => {
	const { id, password } = req.body
	const join_date = new Date().toLocaleDateString("ko-KR")

	db.query("INSERT INTO account(id, password, join_date) VALUES($1, $2, $3)", [id, password, join_date], (err) => {
		if (err) {
			console.error(err.message)
			res.render("error", { message: "회원가입을 하던 중 오류가 발생했습니다." })
			return
		}

		res.redirect("/login")
	})
})
app.post("/write", (req, res) => {
	if (!req.session.user) {
		res.render("error", { message: "로그인 되어 있지 않습니다." })
		return
	}

	const { title, content } = req.body
	const write_date = new Date().toLocaleDateString("ko-KR")
	const writer_id = req.session.user

	db.query(
		"INSERT INTO question(title, content, writer_id, write_date) VALUES($1, $2, $3, $4) RETURNING id",
		[title, content, writer_id, write_date],
		(err, result) => {
			if (err) {
				console.error(err.message)
				res.render("error", "질문 정보를 입력하던 중 오류가 발생했습니다.")
				return
			}

			const question_id = result.rows[0].id

			db.query(
				"UPDATE account SET question_count = question_count + 1 WHERE id = $1",
				[writer_id],
				(err, result) => {
					if (err) {
						console.error(err.message)
						res.render("error", { message: "서버에서 오류가 발생했습니다." })
						return
					}

					res.redirect("/read/" + question_id)
				}
			)
		}
	)
})
app.post("/answer", (req, res) => {
	if (!req.session.user) {
		res.render("error", { message: "로그인 되어 있지 않습니다." })
		return
	}

	const { content } = req.body
	const write_date = new Date().toLocaleDateString("ko-KR")
	const writer_id = req.session.user

	db.query(
		"INSERT INTO answer(content, writer_id, write_date) VALUES($1, $2, $3) RETURNING id",
		[content, writer_id, write_date],
		(err, result) => {
			if (err) {
				console.error(err.message)
				res.render("error", { message: "답변을 등록하던 중 오류가 발생했습니다." })
				return
			}

			db.query(
				"UPDATE question SET answers = array_append(answers, $1) RETURNING id",
				[result.rows[0].id],
				(err, result) => {
					if (err) {
						console.error(err.message)
						res.render("error", { message: "답변을 등록하던 중 오류가 발생했습니다." })
						return
					}

					const question_id = result.rows[0].id

					db.query(
						"UPDATE account SET answer_count = answer_count + 1 WHERE id = $1",
						[writer_id],
						(err, result) => {
							if (err) {
								console.error(err.message)
								res.render("error", { message: "서버에서 오류가 발생했습니다." })
								return
							}

							res.redirect("/read/" + question_id)
						}
					)
				}
			)
		}
	)
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log("Server started. PORT: " + PORT))
