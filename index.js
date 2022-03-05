const fs = require("fs");
const path = require("path");

const fsP = fs.promises;

const config = require('./config');

async function main() {
  const absoluteScheduleDir = path.join(__dirname, config.scheduleDir);
  const dir = await fsP.readdir(absoluteScheduleDir);

  for (let file of dir) {
    const content = await fsP.readFile( path.join(absoluteScheduleDir, file), "UTF-8" );
    let rows = content.split('\n');

    // Professors second names as array corresponding with column order
    let profsAsArray = [];
    let curProf;
    const profs = splitCSV(rows[0]).slice(2);

    while (profs.length > 0) {
      // Take professor second name only
      if (profs[0]) curProf = profs[0].split(' ').filter( word => word[0] === word[0].toUpperCase() && !word.includes('.') ).join('');
      profsAsArray.push(curProf);

      profs.shift();
    }

    // Remove heading with profs names
    rows.shift();

    let day, time, hashTable = {}, dayChanged, appendMode;

    // Rows Parsing
    for (row of rows) {
      let columns = splitCSV(row);

      // Remember day
      if (columns[0]) {
        day = columns[0].replaceAll('"', '').split(',')[0];
        dayChanged = true;
        hashTable[day] = {};

        if (!columns[1]) continue;
      }

      // Remember time
      if (columns[1]) {
        appendMode = false;
        if (time === columns[1] && !dayChanged) appendMode = true;
        time = columns[1];

        if (!appendMode) hashTable[day][time] = [];
      }

      dayChanged = false;

      // If weekend continue, else merge rows into one -
      // because of the way lessons stored on different rows
      if (!hashTable[day][time]) continue;
      hashTable[day][time] = mergeIntoTable(hashTable[day][time], columns.slice(2) );
    }

    Object.keys(hashTable).forEach(day => {
      Object.keys(hashTable[day]).forEach(time => {
        const lessons = hashTable[day][time];
        hashTable[day][time] = {};

        lessons.forEach( (lesson, i) => {
          const les = lesson.trim().replaceAll('  ', ' ');

          if (les !== '' && profsAsArray[i] === config.prof) {
            if (!hashTable[day][time][profsAsArray[i]]) hashTable[day][time][profsAsArray[i]] = "";

            // Put lesson to its prof according to order in profs array
            // generated from first row
            hashTable[day][time][profsAsArray[i]] += ' ' + les;
          }
        });

        // If no lessons on given time - delete it
        if (Object.keys(hashTable[day][time]).length === 0) delete hashTable[day][time];
      });

      // If there's no lessons on that day - delete it
      if (Object.keys(hashTable[day]).length === 0) delete hashTable[day];
    });

    await exportToCSVForGoogleCalendar(profsAsArray, hashTable);
  }

};

main();

function mergeIntoTable(table, elements) {
  if (!table.length) return elements;

  return table.map( (item, i) => item + ' ' + elements[i] );
}

async function exportToCSVForGoogleCalendar(profs, hashTable) {
  const header = "Subject,Start Date,Start Time,End Time,All Day Event,Private";
  let csv = "", replcsv = "";

  profs = [...new Set(profs)];

  Object.keys(hashTable).forEach(day => {
    Object.keys(hashTable[day]).forEach(time => {
      const subject = `"${Object.values(hashTable[day][time]).reduce( (acc, i) => acc + i).replaceAll('"', '').trim()}"`;
      let [startTime, endTime] = time.split('-').map( i => to12h( i.trim() ) );
      let startDate = day.split('.');
      startDate = [ startDate[1], startDate[0], startDate[2] ].join('/');
      const allDayEvent = ( subject.includes("ДЕЖ") );
      const private = false;
      const summary = `\n${subject},${startDate},${startTime},${endTime},${allDayEvent},${private}`;

      profs.some( prof => subject.includes(prof) ) ? replcsv += summary : csv += summary;
    });
  });

  await fsP.writeFile( path.join(__dirname, 'for_calendar.csv'), header + csv );
  await fsP.writeFile( path.join(__dirname, 'for_calendar_repls.csv'), header + replcsv );
}

function to12h(time) {
  const [h, m] = time.split(':');
  const H = h % 12 || 12;
  const ampm = (h < 12 || h === 24) ? "AM" : "PM";

  return `${H}:${m} ${ampm}`;
};

function splitCSV(str) {
  return str.trim().split(';').reduce( (accum, curr) => {
    if (accum.isConcatting) {
      accum.soFar[accum.soFar.length - 1] += ';' + curr
    } else {
      accum.soFar.push(curr)
    }
    if (curr.split('"').length % 2 == 0) {
      accum.isConcatting = !accum.isConcatting
    }
    return accum;
  }, {
    soFar: [],
    isConcatting: false
  }).soFar
}