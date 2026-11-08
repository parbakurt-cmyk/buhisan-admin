import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

var fapp = initializeApp(firebaseConfig), fdb = getFirestore(fapp), auth = getAuth(fapp);

/* Sections and teachers (keep in sync with the public site's teachers page). */
var TCH = {7:[["Orion","Marian Gie O. Amarillo"],["Perseus","Cristy Joy L. Echavez"],["Sirius","Niña Faith H. Fantonial"]],
8:[["Antares","Eva V. Cuizon"],["Aquarius","Farrah E. Rusiana"],["Arcturus","Mary Joy V. Bardilas"]],
9:[["Centaurus","Celerina A. Bedrijo"],["Pollux","Pedro G. Bag-o Jr."]],
10:[["Polaris","April Jane S. Balili"]]};

var USER = null, STU = [], ANN = [], CAL = [], BAN = null, unsub = [];
var S = { tab: "stu", grade: null, sec: "all", edit: null };

function $(i) { return document.getElementById(i); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function mapDocs(s) { return s.docs.map(function (x) { var o = x.data(); o.id = x.id; return o; }); }
function dstr(t) { try { return t && t.toDate ? t.toDate().toISOString().slice(0, 10) : ""; } catch (e) { return ""; } }
function setMsg(id, ok, text) { var m = $(id); if (m) { m.className = "msg " + (ok ? "ok" : "er"); m.textContent = text; } }
function teacherOf(grade, sec) { var l = TCH[grade] || []; for (var i = 0; i < l.length; i++) if (l[i][0] === sec) return l[i][1]; return ""; }

/* ---------- login / access ---------- */
function renderLogin(err) {
  $("who").innerHTML = "";
  $("app").innerHTML = '<div class="box n"><h2>Staff Login</h2><label for="em">Email</label><input id="em" type="email" autocomplete="username"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password"><button id="go" style="margin-top:12px">Sign in</button><div id="m" class="msg er">' + esc(err || "") + '</div><p class="hint">For authorized school staff only.</p></div>';
  var go = function () {
    var b = $("go"); b.disabled = true; setMsg("m", true, "Signing in…");
    signInWithEmailAndPassword(auth, $("em").value.trim(), $("pw").value).catch(function () { setMsg("m", false, "Incorrect email or password."); b.disabled = false; });
  };
  $("go").onclick = go; $("pw").onkeydown = function (e) { if (e.key === "Enter") go(); };
}
function renderDenied(u) {
  $("who").innerHTML = "";
  $("app").innerHTML = '<div class="box n"><h2>No access</h2><p>The account <b>' + esc(u.email) + '</b> is not set up as school staff. Please contact the school administrator.</p><button id="so" class="g">Sign out</button></div>';
  $("so").onclick = function () { signOut(auth); };
}
onAuthStateChanged(auth, function (u) {
  unsub.forEach(function (f) { f(); }); unsub = []; USER = null;
  if (!u) { renderLogin(); return; }
  getDoc(doc(fdb, "staff", u.uid)).then(function (s) {
    if (!s.exists()) { renderDenied(u); return; }
    USER = u; startListeners(); shell();
  }, function () { renderDenied(u); });
});

/* ---------- data ---------- */
function startListeners() {
  var er = function () {};
  unsub.push(onSnapshot(collection(fdb, "students"), function (s) { STU = mapDocs(s); refresh(); }, er));
  unsub.push(onSnapshot(collection(fdb, "announcements"), function (s) { ANN = mapDocs(s); refresh(); }, er));
  unsub.push(onSnapshot(collection(fdb, "events"), function (s) { CAL = mapDocs(s); refresh(); }, er));
  unsub.push(onSnapshot(collection(fdb, "settings"), function (s) { BAN = null; s.docs.forEach(function (x) { if (x.id === "banner") BAN = x.data(); }); }, er));
}
function refresh() {
  if (!USER) return;
  if (S.tab === "stu") stuView();
  else if (S.tab === "ann") { var a = $("alist"); if (a) { a.innerHTML = annList(); wireAnn(); } }
  else if (S.tab === "cal") { var c = $("clist"); if (c) { c.innerHTML = calList(); wireCal(); } }
}

/* ---------- shell ---------- */
function shell() {
  $("who").innerHTML = '<span class="hint" style="margin:0 10px 0 0">' + esc(USER.email) + '</span><button id="lo" class="g sm">Sign out</button>';
  $("lo").onclick = function () { signOut(auth); };
  view();
}
function tabs() {
  var b = function (k, l) { return '<button class="' + (S.tab === k ? "" : "g") + '" data-tab="' + k + '">' + l + '</button>'; };
  return '<div class="row" style="margin-bottom:10px;flex-wrap:wrap">' + b("stu", "Students") + b("ann", "Announcements") + b("cal", "Calendar") + b("ban", "Enrollment banner") + '</div>';
}
function wireTabs() {
  document.querySelectorAll("[data-tab]").forEach(function (b) {
    b.onclick = function () { S.tab = b.getAttribute("data-tab"); S.grade = null; S.edit = null; S.sec = "all"; view(); };
  });
}
function view() { if (S.tab === "ann") annView(); else if (S.tab === "cal") calView(); else if (S.tab === "ban") banView(); else stuView(); }

/* ---------- students ---------- */
function csv(rows) {
  var q = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
  var h = ["ID", "Name", "Date of birth", "Address", "Parent / guardian", "Contact number", "Grade", "Student type", "Section", "Teacher", "Registered"];
  return "\ufeff" + [h].concat(rows.map(function (s) { return [s.studentId, s.name, s.dob, s.address, s.guardian, s.contact, s.grade, s.type, s.section || "", s.teacher || "", dstr(s.createdAt)]; })).map(function (r) { return r.map(q).join(","); }).join("\r\n");
}
function download(name, text) {
  var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function byName(a, b) { return String(a.name).localeCompare(String(b.name)); }
function stuView() {
  var app = $("app"), all = STU.filter(function (s) { return s.grade >= 7 && s.grade <= 10; });
  if (S.edit) {
    var s = all.filter(function (x) { return x.id === S.edit; })[0];
    if (!s) { S.edit = null; return stuView(); }
    var secs = (TCH[s.grade] || []).map(function (t) { return '<option' + (t[0] === s.section ? " selected" : "") + ' value="' + esc(t[0]) + '">' + esc(t[0]) + ' (' + esc(t[1]) + ')</option>'; }).join("");
    app.innerHTML = '<div class="box n"><h2>Edit Student</h2><label>ID</label><input value="' + esc(s.studentId) + '" readonly><label for="en">Name</label><input id="en" value="' + esc(s.name) + '"><label for="ed">Date of birth</label><input id="ed" type="date" value="' + esc(s.dob) + '"><label for="ea">Address</label><input id="ea" value="' + esc(s.address) + '"><label for="eg">Parent / guardian</label><input id="eg" value="' + esc(s.guardian) + '"><label for="ec">Contact number</label><input id="ec" value="' + esc(s.contact) + '"><label for="et">Student type</label><select id="et">' + ["New Student", "Continuing Student", "Transferee", "Balik-Aral"].map(function (o) { return '<option' + (o === s.type ? " selected" : "") + '>' + o + '</option>'; }).join("") + '</select><label for="es">Section (Grade ' + s.grade + ')</label><select id="es"><option value="">Not assigned yet</option>' + secs + '</select><div class="row" style="margin-top:12px"><button id="sv">Save</button><button class="g" id="cx">Cancel</button></div><div id="m" class="msg"></div></div>';
    $("sv").onclick = function () {
      var sec = $("es").value;
      updateDoc(doc(fdb, "students", s.id), { name: $("en").value.trim(), dob: $("ed").value, address: $("ea").value.trim(), guardian: $("eg").value.trim(), contact: $("ec").value.trim(), type: $("et").value, section: sec, teacher: teacherOf(s.grade, sec) })
        .then(function () { S.edit = null; stuView(); }, function () { setMsg("m", false, "Could not save. Please try again."); });
    };
    $("cx").onclick = function () { S.edit = null; stuView(); };
    return;
  }
  if (S.grade) {
    var g = S.grade, ss = all.filter(function (x) { return x.grade === g; }).sort(byName);
    var shown = S.sec === "all" ? ss : S.sec === "none" ? ss.filter(function (x) { return !x.section; }) : ss.filter(function (x) { return x.section === S.sec; });
    var opts = '<option value="all">All sections</option><option value="none">No section yet</option>' + (TCH[g] || []).map(function (t) { return '<option value="' + esc(t[0]) + '"' + (S.sec === t[0] ? " selected" : "") + '>' + esc(t[0]) + '</option>'; }).join("");
    app.innerHTML = '<div class="box">' + tabs() + '<h2>Grade ' + g + '</h2><div class="row"><button class="g" id="bk">Back to Dashboard</button><button id="dl1">Download Excel (CSV)</button></div><label for="sf">Show</label><select id="sf">' + opts + '</select><div id="m" class="msg"></div><div class="wrap"><table class="st"><tr><th>NAME</th><th>DOB</th><th>ADDRESS</th><th>GUARDIAN</th><th>CONTACT</th><th>ID</th><th>TYPE</th><th>SECTION</th><th>ACTIONS</th></tr>' +
      (shown.length ? shown.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.dob) + '</td><td>' + esc(x.address) + '</td><td>' + esc(x.guardian) + '</td><td>' + esc(x.contact) + '</td><td>' + esc(x.studentId) + '</td><td>' + esc(x.type) + '</td><td>' + esc(x.section || "—") + '</td><td><button class="sm" data-e="' + esc(x.id) + '">Edit</button><button class="sm r" data-d="' + esc(x.id) + '">Delete</button></td></tr>'; }).join("") : '<tr><td colspan="9">No students to show.</td></tr>') + '</table></div></div>';
    wireTabs(); $("sf").value = S.sec;
    $("sf").onchange = function () { S.sec = this.value; stuView(); };
    $("bk").onclick = function () { S.grade = null; S.sec = "all"; stuView(); };
    $("dl1").onclick = function () { if (!shown.length) return setMsg("m", false, "There are no students to download."); download("grade-" + g + "-students.csv", csv(shown)); };
    document.querySelectorAll("[data-e]").forEach(function (b) { b.onclick = function () { S.edit = b.getAttribute("data-e"); stuView(); }; });
    document.querySelectorAll("[data-d]").forEach(function (b) { b.onclick = function () { if (confirm("Delete this student record? This cannot be undone.")) deleteDoc(doc(fdb, "students", b.getAttribute("data-d"))).catch(function () { setMsg("m", false, "Could not delete."); }); }; });
    return;
  }
  var cards = "";
  for (var n = 7; n <= 10; n++) { var c = all.filter(function (x) { return x.grade === n; }), un = c.filter(function (x) { return !x.section; }).length; cards += '<div class="tc" data-g="' + n + '"><b>Grade ' + n + '</b><br><small>' + c.length + ' student' + (c.length === 1 ? "" : "s") + (un ? " · " + un + " without section" : "") + '</small></div>'; }
  app.innerHTML = '<div class="box">' + tabs() + '<h2>Students</h2><p class="hint" style="margin:0">' + all.length + ' registered in total. New registrations appear here automatically.</p><button id="dla" style="margin-top:10px">Download all students (Excel CSV)</button><div id="m" class="msg"></div><div class="grid">' + cards + '</div></div>';
  wireTabs();
  $("dla").onclick = function () { if (!all.length) return setMsg("m", false, "There are no students to download yet."); download("bnhs-students.csv", csv(all.slice().sort(function (a, b) { return a.grade - b.grade || byName(a, b); }))); };
  document.querySelectorAll("[data-g]").forEach(function (c) { c.onclick = function () { S.grade = +c.getAttribute("data-g"); S.sec = "all"; stuView(); }; });
}

/* ---------- announcements ---------- */
function annSorted() { return ANN.slice().sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.ts || 0) - (a.ts || 0); }); }
function annList() {
  var l = annSorted();
  return l.length ? l.map(function (a) { return '<div class="ann' + (a.pinned ? " pin" : "") + '"><h3>' + (a.pinned ? "★ " : "") + esc(a.title) + '</h3><div class="meta">' + esc(a.ts ? new Date(a.ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "") + '</div><p>' + esc(a.body).replace(/\n/g, "<br>") + '</p><button class="sm g" data-pin="' + esc(a.id) + '">' + (a.pinned ? "Unpin" : "Pin") + '</button><button class="sm r" data-ad="' + esc(a.id) + '">Delete</button></div>'; }).join("") : '<p class="hint">Nothing posted yet.</p>';
}
function wireAnn() {
  document.querySelectorAll("[data-ad]").forEach(function (b) { b.onclick = function () { if (confirm("Delete this announcement?")) deleteDoc(doc(fdb, "announcements", b.getAttribute("data-ad"))).catch(function () { alert("Could not delete."); }); }; });
  document.querySelectorAll("[data-pin]").forEach(function (b) { b.onclick = function () { var id = b.getAttribute("data-pin"), a = ANN.filter(function (x) { return x.id === id; })[0]; if (a) updateDoc(doc(fdb, "announcements", id), { pinned: !a.pinned }); }; });
}
function annView() {
  $("app").innerHTML = '<div class="box">' + tabs() + '<h2>Announcements</h2><div class="fg"><div class="f"><label for="at">Title</label><input id="at" maxlength="120"></div><div class="f"><label for="ab">Message</label><textarea id="ab" maxlength="2000"></textarea></div></div><label class="chk"><input type="checkbox" id="ap"> Pin to the top</label><button id="apost">Post announcement</button><div id="am" class="msg"></div><h3 style="margin-top:28px">Posted</h3><div id="alist">' + annList() + '</div></div>';
  wireTabs(); wireAnn();
  $("apost").onclick = function () {
    var ti = $("at").value.trim(), bd = $("ab").value.trim();
    if (!ti || !bd) return setMsg("am", false, "Please add a title and a message.");
    var b = $("apost"); b.disabled = true;
    addDoc(collection(fdb, "announcements"), { title: ti, body: bd, pinned: $("ap").checked, ts: Date.now(), by: USER.email }).then(function () {
      setMsg("am", true, "Posted! It now shows on the Home page."); $("at").value = ""; $("ab").value = ""; $("ap").checked = false; b.disabled = false;
    }, function () { setMsg("am", false, "Could not post. Please try again."); b.disabled = false; });
  };
}

/* ---------- calendar ---------- */
function calList() {
  var l = CAL.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return l.length ? l.map(function (e) { return '<div class="ev"><div style="flex:1"><h3>' + esc(e.title) + '</h3><p>' + esc(e.date) + (e.end && e.end !== e.date ? " to " + esc(e.end) : "") + '</p>' + (e.note ? '<p>' + esc(e.note) + '</p>' : "") + '</div><button class="sm r" data-cd="' + esc(e.id) + '">Delete</button></div>'; }).join("") : '<p class="hint">No events yet.</p>';
}
function wireCal() { document.querySelectorAll("[data-cd]").forEach(function (b) { b.onclick = function () { if (confirm("Delete this event?")) deleteDoc(doc(fdb, "events", b.getAttribute("data-cd"))).catch(function () { alert("Could not delete."); }); }; }); }
function calView() {
  $("app").innerHTML = '<div class="box">' + tabs() + '<h2>School Calendar</h2><div class="fg"><div class="f"><label for="ct">Event title</label><input id="ct" maxlength="120"></div><div><label for="cd">Date</label><input id="cd" type="date"></div><div><label for="ce">End date (optional)</label><input id="ce" type="date"></div><div class="f"><label for="cn">Note (optional)</label><input id="cn" maxlength="200"></div></div><button id="cpost" style="margin-top:14px">Add to calendar</button><div id="cm" class="msg"></div><h3 style="margin-top:28px">Events</h3><div id="clist">' + calList() + '</div></div>';
  wireTabs(); wireCal();
  $("cpost").onclick = function () {
    var ti = $("ct").value.trim(), d = $("cd").value, e = $("ce").value;
    if (!ti || !d) return setMsg("cm", false, "Please add a title and a date.");
    if (e && e < d) return setMsg("cm", false, "The end date cannot be before the start date.");
    addDoc(collection(fdb, "events"), { title: ti, date: d, end: e || "", note: $("cn").value.trim() }).then(function () {
      setMsg("cm", true, "Added to the calendar."); ["ct", "cd", "ce", "cn"].forEach(function (i) { $(i).value = ""; });
    }, function () { setMsg("cm", false, "Could not add. Please try again."); });
  };
}

/* ---------- banner ---------- */
function banView() {
  var s = (BAN && BAN.status) || "hidden", m = (BAN && BAN.message) || "", o = function (v, l) { return '<option value="' + v + '"' + (s === v ? " selected" : "") + '>' + l + '</option>'; };
  $("app").innerHTML = '<div class="box n">' + tabs() + '<h2>Enrollment banner</h2><p class="hint" style="margin:0 0 6px">A bar shown at the top of the public Home and Enroll pages.</p><label for="bs">Status</label><select id="bs">' + o("hidden", "Hidden") + o("open", "Open (green)") + o("closed", "Closed (gray)") + o("notice", "Notice (blue)") + '</select><label for="bm">Message</label><input id="bm" maxlength="140" value="' + esc(m) + '" placeholder="Example: Enrollment is OPEN: June 1 to 5"><button id="bsave" style="margin-top:12px">Save banner</button><div id="bmsg" class="msg"></div></div>';
  wireTabs();
  $("bsave").onclick = function () {
    var o2 = { status: $("bs").value, message: $("bm").value.trim() };
    if (o2.status !== "hidden" && !o2.message) return setMsg("bmsg", false, "Please type a message for the banner.");
    setDoc(doc(fdb, "settings", "banner"), o2).then(function () { setMsg("bmsg", true, o2.status === "hidden" ? "Banner hidden." : "Saved. It now shows on the public site."); }, function () { setMsg("bmsg", false, "Could not save. Please try again."); });
  };
}
