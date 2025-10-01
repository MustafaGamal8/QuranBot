import TelegramBot from "node-telegram-bot-api";
import { getReciters, getSurahs } from "../utils/quranApi.js";
import { removeArabicDiacritics } from "../utils/utils.js";
import dotenv from "dotenv";
dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

let mood = "";
let reciter_index;
let recitersData;
let surahsData;
let userMode = {}; // { [chat_id]: 'dynamic' | 'manual' }

export async function setupBot() {
  recitersData = await getReciters();
  surahsData = await getSurahs();

  let handelChoose;

  // Helper: fuzzy match Arabic names
  function fuzzyFindName(input, names) {
    input = removeArabicDiacritics(input.trim());
    let best = null, bestScore = 0;
    for (const name of names) {
      const cleanName = removeArabicDiacritics(name);
      let score = 0;
      if (cleanName === input) score = 100;
      else if (cleanName.includes(input)) score = 80;
      else if (input.includes(cleanName)) score = 70;
      else {
        // Partial word match
        const words = input.split(" ");
        for (const w of words) if (cleanName.includes(w)) score += 20;
      }
      if (score > bestScore) {
        bestScore = score;
        best = name;
      }
    }
    return bestScore >= 60 ? best : null;
  }

  // Message handler: use mode
  bot.on("message", (msg) => {
    const msg_text = msg.text;
    const chat_id = msg.chat.id;
    // If user is picking mode
    if (mood === "choose_mode") return;
    // If user hasn't picked mode, do nothing (only /start sends the mode selection)
    if (!userMode[chat_id] || userMode[chat_id] === "pending") {
      return;
    }
    // DYNAMIC MODE
    if (userMode[chat_id] === "dynamic") {
      const surahNames = surahsData.data.map(s => s.name);
      const reciterNames = recitersData.reciters.map(r => r.name);
      let foundSurah = null, foundReciter = null;
      for (let i = 2; i <= msg_text.length - 2; i++) {
        const part1 = msg_text.slice(0, i).trim();
        const part2 = msg_text.slice(i).trim();
        const surah = fuzzyFindName(part1, surahNames);
        const reciter = fuzzyFindName(part2, reciterNames);
        if (surah && reciter) {
          foundSurah = surah;
          foundReciter = reciter;
          break;
        }
        // Try reverse
        const surah2 = fuzzyFindName(part2, surahNames);
        const reciter2 = fuzzyFindName(part1, reciterNames);
        if (surah2 && reciter2) {
          foundSurah = surah2;
          foundReciter = reciter2;
          break;
        }
      }
      if (!foundSurah && !foundReciter) {
        foundReciter = fuzzyFindName(msg_text, reciterNames);
        foundSurah = fuzzyFindName(msg_text, surahNames);
      }
      if (foundSurah && foundReciter) {
        const reciterObj = recitersData.reciters.find(r => r.name === foundReciter);
        const surahObj = surahsData.data.find(s => s.name === foundSurah);
        if (reciterObj && surahObj) {
          const surahNum = surahObj.number;
          const moshaf = reciterObj.moshaf[0];
          if (moshaf.surah_list.split(",").includes(String(surahNum))) {
            const reciter_server = moshaf.server;
            const surah_link = reciter_server + String(surahNum).padStart(3, "0") + ".mp3";
            bot.sendAudio(chat_id, surah_link)
              .catch(() => {
                bot.sendMessage(chat_id, `حدث خطأ ولكن هذا هو رابط السورة ${surah_link}`);
              });
            return;
          } else {
            bot.sendMessage(chat_id, `عذراً، هذا القارئ لا يملك تلاوة لهذه السورة.`);
            return;
          }
        }
      }
      if (foundReciter && !foundSurah) {
        const reciterObj = recitersData.reciters.find(r => r.name === foundReciter);
        if (reciterObj) {
          const surah_list = reciterObj.moshaf[0].surah_list.split(",");
          const menuOptions = surah_list.map(s => {
            const surah_name = removeArabicDiacritics(surahsData.data[s - 1].name);
            return [{ text: `${surah_name}`, callback_data: `${s}` }];
          });
          bot.sendMessage(chat_id, `اختر السورة من تلاوات القارئ ${reciterObj.name}:`, { reply_markup: { inline_keyboard: menuOptions } });
          mood = "choose_mood";
          reciter_index = recitersData.reciters.indexOf(reciterObj);
          return;
        }
      }
      if (foundSurah && !foundReciter) {
        bot.sendMessage(chat_id, `تم التعرف على السورة (${foundSurah})، يرجى كتابة اسم القارئ.`);
        mood = "choose_reciter";
        return;
      }
      bot.sendMessage(chat_id, "لم يتم التعرف على السورة أو القارئ. جرب مرة أخرى أو استخدم الوضع اليدوي.");
      return;
    }
    // MANUAL MODE (old flow)
    if (userMode[chat_id] === "manual") {
      if (mood === "choose_reciter") {
        const menuOptions = [];
        recitersData.reciters.map(r => {
          const r_name = removeArabicDiacritics(r.name);
          if (r_name.includes(msg_text)) {
            const temp_list = [{ text: r.name, callback_data: r.name }];
            menuOptions.push(temp_list);
          }
        });
        const replyMarkup = { inline_keyboard: menuOptions };
        if (menuOptions.length > 0) {
          bot.sendMessage(chat_id, "يرجى اختيار القارئ", { reply_markup: replyMarkup });
        } else {
          bot.sendMessage(chat_id, "عذرا القارئ غير متوفر");
        }
      }
    }
  });

  bot.on("callback_query", (query) => {
    const chat_id = query.message.chat.id;
    const chosenOption = query.data;
    // Mode selection
    if (mood === "choose_mode") {
      if (chosenOption === "mode_dynamic") {
        userMode[chat_id] = "dynamic";
        bot.sendMessage(chat_id, "تم تفعيل الوضع الديناميكي! يمكنك الآن كتابة اسم السورة واسم القارئ في رسالة واحدة.");
        mood = "";
        return;
      } else if (chosenOption === "mode_manual") {
        userMode[chat_id] = "manual";
        bot.sendMessage(chat_id, "تم تفعيل الوضع اليدوي! يمكنك الآن اختيار القارئ ثم السورة خطوة بخطوة.");
        mood = "choose_reciter";
        return;
      }
    }
    if (mood === "choose_reciter") {
      recitersData.reciters.map(r => {
        if (chosenOption === r.name) {
          reciter_index = recitersData.reciters.indexOf(r);
          mood = "choose_surah";
        }
      });
    }
    handelChoose = () => {
      if (mood === "choose_surah") {
        const choosen_reciter = recitersData.reciters[reciter_index];
        const surah_total = choosen_reciter.moshaf[0].surah_total;
        const menuOptions = [[{ text: "بحث", callback_data: "بحث" }], [{ text: "عرض", callback_data: "عرض" }], [{ text: "خروج", callback_data: "خروج" }]];
        const replyMarkup = { inline_keyboard: menuOptions };
        bot.sendMessage(chat_id, `القارئ ${choosen_reciter.name} \n عدد السور الموجودة ${surah_total}`, { reply_markup: replyMarkup });
        mood = "choose_mood";
      }
    };
    handelChoose();
  });

  bot.on("callback_query", (query) => {
    const chat_id = query.message.chat.id;
    const chosenOption = query.data;
    const menuOptions = [[{ text: "خروج", callback_data: "خروج" }]];
    if (mood === "choose_mood") {
      const choosen_reciter = recitersData.reciters[reciter_index];
      const reciter_surah = choosen_reciter.moshaf[0].surah_list.split(",");
      switch (chosenOption) {
        case 'عرض':
          reciter_surah.map(s => {
            const surah_name = removeArabicDiacritics(surahsData.data[s - 1].name);
            const temp_list = [{ text: `${surah_name}`, callback_data: `${s}` }];
            menuOptions.push(temp_list);
          });
          bot.sendMessage(chat_id, "السور", { reply_markup: { inline_keyboard: menuOptions } });
          mood = "send";
          break;
        case 'بحث':
          bot.sendMessage(chat_id, "اكتب اسم السورة");
          mood = "search";
          bot.on("message", (msg) => {
            if (mood === "search") {
              const menuOptions = [[{ text: "خروج", callback_data: "خروج" }]];
              reciter_surah.map(s => {
                const surah_name = removeArabicDiacritics(surahsData.data[s - 1].name);
                if (surah_name.includes(msg.text)) {
                  const temp_list = [{ text: `${surah_name}`, callback_data: `${s}` }];
                  menuOptions.push(temp_list);
                }
              });
              if (menuOptions.length > 1) {
                bot.sendMessage(chat_id, "السور", { reply_markup: { inline_keyboard: menuOptions } });
                mood = "send";
              } else {
                bot.sendMessage(chat_id, "السورة غير متوفرة لدى القارئ");
                mood = "choose_surah";
                handelChoose();
              }
            }
          });
          break;
        case 'خروج':
          bot.sendMessage(chat_id, "شكرا لاستخدامك البوت 😊🙌");
          mood = "choose_reciter";
          break;
        default:
          break;
      }
    }
    if (query.message.text === "السور") {
      const chosenOption = query.data;
      const choosen_reciter = recitersData.reciters[reciter_index];
      const reciter_server = choosen_reciter.moshaf[0].server;
      const surah_link = reciter_server + chosenOption.padStart(3, "0") + ".mp3";
      bot.sendAudio(chat_id, surah_link)
        .catch(() => {
          bot.sendMessage(chat_id, `حدث خطأ ولكن هذا هو رابط السورة ${surah_link}`);
        });
      mood = "choose_surah";
      handelChoose();
    }
  });

  const commands = [
    { command: "start", description: "رسالة الترحيب", RegExp: /\/start/ },
    { command: "about", description: "عن المبرمج", RegExp: /\/about/ },
    { command: "help", description: "مساعدة", RegExp: /\/help/ }
  ];

  bot.onText(commands[0].RegExp, (msg) => {
    const chatId = msg.chat.id;
    userMode[chatId] = "pending";
    bot.sendMessage(chatId, "أهلاً بك في بوت تلاوة القرآن الكريم!\nيرجى اختيار وضع الاستخدام:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "وضع ديناميكي (اكتب السورة والقارئ معًا)", callback_data: "mode_dynamic" }],
          [{ text: "وضع يدوي (اختيار خطوة بخطوة)", callback_data: "mode_manual" }]
        ]
      }
    });
    mood = "choose_mode";
  });

  bot.onText(commands[2].RegExp, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
      "للاستماع إلى القرآن الكريم يمكنك الآن إرسال رسالة واحدة مثل: \n" +
      "سورة الفاتحة اسلام صبجي\n" +
      "وسيقوم البوت بتشغيل السورة مباشرة إذا وجدها.\n" +
      "\nأو يمكنك اتباع الخطوات التقليدية:\n" +
      "1. اختر القارئ من القائمة\n" +
      "2. اختر السورة التي ترغب في الاستماع إليها\n" +
      "3. استمتع بالاستماع إلى التلاوة العطرة."
    );
  });

  bot.onText(commands[1].RegExp, (msg) => {
    const chat_id = msg.chat.id;
    bot.sendMessage(chat_id, "Mustafa Gamal Software Developer", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "بورتفوليو", url: "https://mustafa-gamal.vercel.app" }]
        ]
      }
    });
    mood = "choose_reciter";
  });

  bot.setMyCommands(commands.map(c => ({ command: c.command, description: c.description })));
  bot.on("polling_error", console.log);
}
