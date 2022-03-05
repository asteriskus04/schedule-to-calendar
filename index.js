const fs = require("fs");
const path = require("path");

const fsP = fs.promises;

const csvDirectory = "csv";
const prepod = "Бормотов";

async function parseShedule() {
  const dir = await fsP.readdir(path.join(__dirname, csvDirectory));

  for (let file of dir) {
    const content = await fsP.readFile(path.join(__dirname, csvDirectory, file), "UTF-8");
    let rows = content.split('\n');

    //const header = rows[0];
    //console.log(rows[0]);
    //rows.shift();

    let profsAsArray = [], curProf;
    const profs = splitCSV(rows[0]).slice(2);
    while (profs.length > 0) {
      if (profs[0]) curProf = profs[0].split(' ').filter(word => word[0] === word[0].toUpperCase() && !word.includes('.')).join('');
      profsAsArray.push(curProf);

      profs.shift();
    }

    rows.shift();

    let day, time, hashTable = {};

    for (row of rows) {
      let columns = splitCSV(row);

      if (columns[0]) {
        day = columns[0].replaceAll('"', '').split(',')[0];
        hashTable[day] = {};

        if (!columns[1]) continue;
      }

      if (columns[1]) {
        time = columns[1];

        hashTable[day][time] = [];
      }

      if (!hashTable[day][time]) continue;
      hashTable[day][time] = mergeIntoTable(hashTable[day][time], columns.slice(2));
    }

    Object.keys(hashTable).forEach(day => {
      Object.keys(hashTable[day]).forEach(time => {
        const lessons = hashTable[day][time];
        hashTable[day][time] = {};

        lessons.forEach((lesson, i) => {
          const les = lesson.trim().replaceAll('  ', ' ');

          if (les !== '' && profsAsArray[i] === prepod) { //Choose prof  
            hashTable[day][time][profsAsArray[i]] += ' ' + lesson;
          }
        });

        Object.keys(hashTable[day][time]).forEach(prof => {
          hashTable[day][time][prof] = hashTable[day][time][prof].replace('undefined', '').trim();
        });

        if (Object.keys(hashTable[day][time]).length === 0) delete hashTable[day][time];
      });

      if (Object.keys(hashTable[day]).length === 0) delete hashTable[day];
    });

    await fsP.writeFile(path.join(__dirname, 'test.json'), JSON.stringify(hashTable));

    await exportToCSVForGoogleCalendar(hashTable);
  }

};

parseShedule();

function mergeIntoTable(table, elements) {
  if (!table.length) return elements;

  return table.map((item, i) => item + ' ' + elements[i]);
}

async function exportToCSVForGoogleCalendar(hashTable) {
  let csv = "Subject,Start Date,Start Time,End Time,All Day Event,Private";

  Object.keys(hashTable).forEach(day => {
    Object.keys(hashTable[day]).forEach(time => {
      const subject = `"${Object.values(hashTable[day][time]).reduce((acc, i) => acc + i).replace('"', '')}"`;
      let [startTime, endTime] = time.split('-').map(i => to12h(i.trim()));
      let startDate = day.split('.');
      startDate = [startDate[1], startDate[0], startDate[2]].join('/');
      const allDayEvent = (subject.includes("ДЕЖ"));
      const private = false;

      csv += `\n${subject},${startDate},${startTime},${endTime},${allDayEvent},${private}`;
    });
  });

  await fsP.writeFile(path.join(__dirname, 'for_calendar.csv'), csv);
}

function to12h(time) {
  const [h, m] = time.split(':');
  const H = h % 12 || 12;
  const ampm = (h < 12 || h === 24) ? "AM" : "PM";

  return `${H}:${m} ${ampm}`;
}; 

function splitCSV(str) {
  return str.trim().split(';').reduce((accum,curr)=>{
    if(accum.isConcatting) {
      accum.soFar[accum.soFar.length-1] += ';'+curr
    } else {
      accum.soFar.push(curr)
    }
    if(curr.split('"').length % 2 == 0) {
      accum.isConcatting= !accum.isConcatting
    }
    return accum;
  },{soFar:[],isConcatting:false}).soFar
}
