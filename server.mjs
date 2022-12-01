import { config } from "dotenv"
config()

const { PORT, COOKIE_SECRET } = process.env

import express, { json, urlencoded } from "express"
const app = express()
import { createServer } from "http"
const server = createServer(app)

import { Account, Question, Answer } from "./database.mjs"
import { renderFile } from "ejs"
import express_session from "express-session"

app.set("view engine", "ejs")
app.set("views", "views")
app.engine("html", renderFile)

app.use(express.static("static"))
app.use(json())
app.use(urlencoded({ extended: true }))
app.use(
	express_session({
		secret: COOKIE_SECRET,
		resave: false,
		saveUninitialized: true
	})
)

function err(res, message) {
	res.render("error", { message })
}

// GET
app.get("/", (req, res) => {
	if (!req.session.user) {
		res.redirect("/login")
		return
	}

	const { page = 0 } = req.query
	Question.list(page)
		.then((question_list) => res.render("index", { question_list }))
		.catch((error) => {
			console.log(error)
			err(res, "서버에서 오류가 발생했습니다.")
		})
})
app.get("/login", (_, res) => res.render("login.html"))

app.get("/sign_up", (_, res) => res.render("signup.html"))

app.get("/id_check/:id", (req, res) => {
	const { id } = req.params
	Account.id_check(id)
		.then((result) => res.send(result))
		.catch(() => res.sendStatus(500))
})

app.get("/account", (req, res) => {
	if (!req.session.user) {
		res.redirect("/login")
		return
	}

	Account.get(req.session.user)
		.then((account_data) => res.render("account", account_data))
		.catch((error) => {
			console.log(error)
			err(res, "서버에서 오류가 발생했습니다.")
		})
})

app.get("/choose/:id/:answer_id", (req, res) => {
	const { id, answer_id } = req.params
	Question.choose_answer(id, answer_id)
		.then(() => res.redirect("/read/" + id))
		.catch((error) => {
			console.log(error)
			err(res, "서버에서 오류가 발생했습니다.")
		})
})

app.get("/logout", (req, res) => {
	if (req.session.user) req.session.destroy()
	res.redirect("/")
})

app.get("/delete/:password", (req, res) => {
	const { password } = req.params

	if (req.session.user) {
		Account.delete(req.session.user, password)
			.then((result) => {
				if (result === "NOT_EXISTS") err(res, "존재하지 않는 계정입니다.")
				else if (result === "INCORRECT_PASSWORD") err(res, "비밀번호가 일치하지 않습니다.")
				else res.redirect("/logout")
			})
			.catch((error) => {
				console.log(error)
				err(res, "서버에서 오류가 발생했습니다.")
			})
	} else {
		res.redirect("/login")
		return
	}
})

app.get("/read/:id", (req, res) => {
	const { id } = req.params
	Question.get(req.session.user, id)
		.then((question_data) => {
			if (question_data === "NOT_EXISTS") err(res, "존재하지 않는 질문입니다.")
			else res.render("read", question_data)
		})
		.catch((error) => {
			console.log(error)
			err(res, "서버에서 오류가 발생했습니다.")
		})
})

app.get("/write", (req, res) => {
	if (!req.session.user) {
		res.redirect("/login")
		return
	}

	res.render("write.html")
})

app.get("/delete_question/:id", (req, res) => {
	if (!req.session.user) {
		res.redirect("/login")
		return
	}

	const { id } = req.params
	Question.delete(id)
		.then(() => res.redirect("/"))
		.catch((error) => {
			console.log(error)
			err(res, "서버에서 오류가 발생했습니다.")
		})
})

// POST
app.post("/login", (req, res) => {
	const { id, password } = req.body
	Account.login(id, password)
		.then((result) => {
			if (result === "NOT_EXISTS") err(res, "존재하지 않는 계정입니다.")
			else if (result === "INCORRECT_PASSWORD") err(res, "비밀번호가 일치하지 않습니다.")
			else {
				req.session.user = id
				res.redirect("/")
			}
		})
		.catch((error) => {
			console.log(error)
			err(res, "서버에서 오류가 발생했습니다.")
		})
})

app.post("/sign_up", (req, res) => {
	const { id, password } = req.body
	Account.sign_up(id.slice(0, 20), password)
		.then(() => res.redirect("/login"))
		.catch((error) => {
			console.log(error)
			err(res, "서버에서 오류가 발생했습니다.")
		})
})

app.post("/write", (req, res) => {
	if (!req.session.user) {
		res.redirect("/login")
		return
	}

	const { title, content } = req.body
	Question.write(req.session.user, title, content)
		.then((result) => res.redirect("/read/" + result))
		.catch((error) => {
			console.log(error)
			err(res, "서버에서 오류가 발생했습니다.")
		})
})

app.post("/answer/:id", (req, res) => {
	if (!req.session.user) {
		res.redirect("/login")
		return
	}

	const { id } = req.params
	const { content } = req.body
	Answer.write(req.session.user, id, content)
		.then(() => res.redirect("/read/" + id))
		.catch((error) => {
			console.log(error)
			err(res, "서버에서 오류가 발생했습니다.")
		})
})

server.listen(PORT, () => console.log("Server started. PORT: " + PORT))
