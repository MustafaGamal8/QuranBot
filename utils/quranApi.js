// Handles Quran and reciters API requests
import fetch from "node-fetch";

export async function getReciters() {
  const response = await fetch('https://www.mp3quran.net/api/v3/reciters?language=ar');
  return response.json();
}

export async function getSurahs() {
  const response = await fetch('http://api.alquran.cloud/v1/surah');
  return response.json();
}
