var express = require('express'), app = express();
var ServerData = require('./rpc/data-server.js');
var server = new ServerData(app, 3000);
app.use('/client', express.static(__dirname + '/../client_env/js'));
app.use('/', express.static(__dirname + '/../client_env'));
var meetings;
var tasks;
var courses;
function Meeting(id, title, notes, time) {
    function Meeting(title, notes, time) {
        this.title = title;
        this.notes = notes;
        this.start = new Date().getTime();
        this.end = addMinutes(new Date(time), 120);
    }
    return server.makeReplicatedObject(id, new Meeting(title, notes, time));
}
function Task(id, title, priority) {
    function Task(title, priority) {
        this.title = title;
        this.status = -1;
        this.priority = priority;
    }
    return server.makeReplicatedObject(id, new Task(title, priority));
}
function Course(id, title, duration, time) {
    function Course(title, duration, time) {
        this.title = title;
        this.duration = duration;
        this.time = time;
    }
    return server.makeObservableObject(id, new Course(title, duration, time));
}
meetings = server.makeReplicatedObject('meetings', []);
tasks = server.makeReplicatedObject('tasks', []);
courses = server.makeReplicatedObject('courses', []);
var dataCourses;
var coursesJSON;
addTask('Learn uni-corn!', 10);
function anonf3(json) {
    addCourse(json.title, json.duration, json.time);
}
fs.readFile('data.json', function (err1, res1) {
    dataCourses = res1;
    coursesJSON = JSON.parse(dataCourses);
    coursesJSON.forEach(anonf3);
});
function isValidTimeDescr(descr) {
    var sched;
    sched = later.parse.text(descr);
    return sched.error === -1;
}
function happenedInPast(date) {
    var now;
    now = new Date().getTime();
    return date < now;
}
function addMinutes(date, minutes) {
    var ms;
    ms = date.getTime();
    return new Date(ms + minutes * 60000);
}
function calculateNext(timeDescription) {
    var parsed;
    var s;
    var next;
    parsed = later.parse.text(timeDescription);
    s = later.schedule(parsed);
    next = s.next(1);
    return new Date(next);
}
function calculatePrevious(timeDescription) {
    var parsed;
    var s;
    var next;
    parsed = later.parse.text(timeDescription);
    s = later.schedule(parsed);
    next = s.prev(1);
    return new Date(next);
}
function happenedToday(date1, date2) {
    var year1;
    var year2;
    var month2;
    var month1;
    var day1;
    var day2;
    year1 = date1.getFullYear();
    year2 = date2.getFullYear();
    month2 = date2.getMonth();
    month1 = date1.getMonth();
    day1 = date1.getDay();
    day2 = date2.getDay();
    return year1 == year2 && month1 == month2 && day1 == day2;
}
later.date.localTime();
var activityToday;
var latestUpdate;
function updateActivity() {
    var now;
    now = new Date();
    if (latestUpdate) {
        if (happenedToday(latestUpdate, now)) {
            activityToday = activityToday + 1;
            latestUpdate = now;
        } else {
            activityToday = 1;
            latestUpdate = now;
        }
    } else {
        latestUpdate = now;
        activityToday = activityToday + 1;
    }
}
function processMeetingMonths() {
    var currYear;
    var months;
    var meetings;
    currYear = new Date().getFullYear();
    function anonf4(meeting) {
        var date;
        var month;
        var year;
        date = new Date();
        month = date.getMonth();
        year = date.getFullYear();
        if (year == currYear)
            months[month] = months[month] + 1;
    }
    months = [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
    ];
    meetings = getMeetings();
    meetings.forEach(anonf4);
    return months;
}
function processTasksStatus() {
    var todo;
    var finished;
    var inprogress;
    var tasks;
    todo = 0;
    finished = 0;
    function anonf5(task) {
        if (task.status < 0) {
            todo++;
        } else if (task.status > 0) {
            finished++;
        } else {
            inprogress++;
        }
    }
    inprogress = 0;
    tasks = getTasks();
    tasks.forEach(anonf5);
    return [
        todo,
        finished,
        inprogress
    ];
}
activityToday = 0;
latestUpdate = false;
server.expose({});
