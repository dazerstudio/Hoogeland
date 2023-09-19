import type { NextApiRequest, NextApiResponse } from 'next'

function dateToFormat(date: Date) {
  return date.toLocaleDateString('zh')
  // yyyy/mm/dd
    .replaceAll('/', '-');
  // yyyy-mm-dd
}

export async function getDays<Input> (token: any, userId: any, date?: any) {
  const from = date ? new Date(date) : new Date();

  const to = new Date(from.getTime() + /* A Week */ 604800000);
  
  let response = await fetch(`https://isw.magister.net/api/personen/${userId}/afspraken?status=1&tot=${dateToFormat(to)}&van=${dateToFormat(from)}`, {
    "headers": {
      "accept": "application/json, text/plain, */*",
      "accept-language": "nl,en;q=0.9,en-GB;q=0.8,en-US;q=0.7",
      "authorization": token,
      "sec-ch-ua": "\"Chromium\";v=\"116\", \"Not)A;Brand\";v=\"24\", \"Microsoft Edge\";v=\"116\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin"
    },
    "referrer": "https://isw.magister.net/magister/",
    "referrerPolicy": "strict-origin-when-cross-origin",
    "method": "GET",
    "mode": "cors",
    "credentials": "include"
  });

  let data = await response.json();

  
  if(data === "Invalid Operation" || data === "SecurityToken Expired") return { success: false, error: data, status: 401 };

  let days: any[] = [];

  data.Items.forEach((item: any) => {
    let day = days.find(entry => {
      if(!entry?.day) return false;
      else return (new Date(entry.day).toDateString() === new Date(item.Start).toDateString());
    });

    if (!day) {
      days.push({
        day: new Date(item.Start).toDateString(),
        subjects: [],
      });
    }
    // Find the day again (either the existing one or the newly created one)
    day = days.find(entry => {
      if(!entry?.day) return false;
      else return (new Date(entry.day).toDateString() === new Date(item.Start).toDateString());
    });

    item.Start = new Date(item.Start).getTime();
    item.Einde = new Date(item.Einde).getTime();

    switch(item.InfoType) {
      case 1:
        item.type = 'Huiswerk';
        break;
      case 2:
        item.type = 'Proefwerk';
        break;
      case 3:
        item.type = 'Tentamen';
        break;
      case 4:
        item.type = 'SO';
        break;
      case 5:
        item.type = 'MO';
        break;
    }
    
    day.subjects.push(item);
  });

  days = days.map(day => {
    let smallBreak1 = false;
    let bigBreak = false;
    let smallBreak2 = false;

    day.subjects = day.subjects?.map((subject: any, i: number) => {

      const subjects = day.subjects
      const hour = subject.LesuurVan;
      const location = parseInt(subject.Lokatie);

      if (typeof hour !== 'number' || typeof location !== 'number') return subject;
      if (hour < 3 || hour > 8) return subject;
      
      const smallBreak = () => {
        subject.break = true
        subject.breakStart = subjects[i - 1]?.Einde
        subject.breakEnd = subject.Start
      }
      const bigBreakFn = () => {
        bigBreak = true
        subject.bigBreak = true
        subject.breakStart = subjects[i - 1]?.Einde
        subject.breakEnd = subject.Start
      }
      const isMinirooster = () => {
        const start = new Date(subject.Start);
        const end = new Date(subject.Einde);
        return (start.getMinutes() == end.getMinutes() && start.getHours() + 1 == end.getHours()) || 60 * start.getHours() + start.getMinutes() + 30 == 60 * end.getHours() + end.getMinutes();
      }

      const minirooster = isMinirooster();
      
      if (
        location == 7 ||
        location == 8 ||
        subject.Vakken[0].Naam == 'Lichamelijke opvoeding' ||
        (location >= 104 && location <= 127) ||
        (location >= 228 && location <= 258) ||
        (location >= 71 && location <= 88)
      ) {
        // Break flow 1  
        if (hour === 3 && !minirooster) {
          // Small Break
          smallBreak1 = true
          subject.Start += 900000
          subject.stroom = '1';
          smallBreak()
        }
        else if (hour === 5) {
          // Big Break
          subject.Start += 1800000
          subject.stroom = '1';
          bigBreakFn()
        }
        else if (hour === 7 && !minirooster) {
          // Small Break
          smallBreak2 = true
          subject.Start += 900000
          subject.stroom = '1';
          smallBreak()
        }
      }
      // Break flow 2  
      if (hour === 4 && !smallBreak1 && !minirooster) {
        // Small Break
        smallBreak1 = true
        if (subjects[i - 1]?.Einde) subjects[i - 1].Einde -= 900000
        subject.stroom = '2';
        smallBreak()
      }
      else if (hour === 6 && !bigBreak) {
        // Big Break
        if (subjects[i - 1]?.Einde) subjects[i - 1].Einde -= 1800000
        subject.stroom = '2';
        bigBreakFn()
      }
      else if (hour === 8 && !smallBreak2 && !minirooster) {
        // Small Break
        smallBreak2 = true
        if (subjects[i - 1]?.Einde) subjects[i - 1].Einde -= 900000
        subject.stroom = '2';
        smallBreak()
      }

      
      return subject;
    });
    
    return day;
  });

  return { days, success: true, status: 200 };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = req.cookies;
  
  if(!body.userId || !body.token) {
    res.status(400).json({ success: false, error: 'Missing user id or auth token' });
    return;
  }

  let data = await getDays(body.token, body.userId, req.body?.date);
  
  res.status(data.status).json(data.success === true ? data.days : { success: false, error: data.error });
}