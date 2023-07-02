
const response = await fetch('https://www.mp3quran.net/api/v3/reciters?language=ar');
const data = await response.json();

console.log(data.reciters[86].moshaf[0].surah_list)


var reciterSurhs = data.reciters[1].moshaf[0].surah_list.split(",");
let surahSrc =
data.reciters[1].moshaf[0].server + 
reciterSurhs[0].padStart(3, "0") +
".mp3";


console.log(reciterSurhs)

// _____________

// const response = await fetch('http://api.alquran.cloud/v1/surah');
// const data = await response.json();
// console.log(data.data[113])