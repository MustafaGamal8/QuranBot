#!/usr/bin/env node
import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import express from "express";

const bot = new TelegramBot("6165372837:AAEhUz-bPSDoqKqmjmYh9Kb8WN7H4enKrgw", { polling: true });

const responsePromise = fetch('https://www.mp3quran.net/api/v3/reciters?language=ar');
const quran_responsePromise = fetch('http://api.alquran.cloud/v1/surah');

const app = express();
app.get('/', (req, res) => {
  res.send("heloo world");
});

const port = 3000;
app.listen(port, () => {
  console.log(`server running at http://localhost:${port}/`);
});

responsePromise
  .then(response => response.json())
  .then(data => {
    quran_responsePromise
      .then(quran_response => quran_response.json())
      .then(quran_data => {
        let handelChoose;

        const removeArabicDiacritics = (text) => {
          const diacritics = /[\u064B-\u0652\u06E1\u0670]/g;
          const hamza = /[أ,آ,ٱ,إ]/g;
    
          // Remove diacritical marks using regular expression
          let newtext = text.replace(diacritics, "");
          newtext = newtext.replace(hamza, "ا");
          return newtext;
        };
    
        let mood = "";
        let reciter_index;
        bot.on("message", (msg) => {
          if (mood === "choose_reciter") {
            const msg_text = msg.text;
            const chat_id = msg.chat.id;
            const menuOptions = [];
            let exist = false;
            data.reciters.map(r => {
              const r_name = removeArabicDiacritics(r.name);
              if (r_name.includes(msg_text)) {
                const temp_list = [{ text: r.name, callback_data: r.name }];
                menuOptions.push(temp_list);
                exist = true;
              } else {
                exist = false;
              }
            });
            const replyMarkup = {
              inline_keyboard: menuOptions,
            };
    
            if (menuOptions.length > 0) {
              bot.sendMessage(chat_id, "يرجى اختيار القارئ", { reply_markup: replyMarkup });
            } else {
              bot.sendMessage(chat_id, "عذرا القارئ غير متوفر");
            }
          }
        });

        bot.on("callback_query", (query) => {
          const chat_id = query.message.chat.id;
          const chosenOption = query.data;
          if (mood === "choose_reciter") {
            data.reciters.map(r => {
              const r_name = r.name;
              if (chosenOption === r_name) {
                reciter_index = data.reciters.indexOf(r);
                mood = "choose_surah";
              }
            });
          }
          handelChoose = () => {
            if (mood === "choose_surah") {
              const choosen_reciter = data.reciters[reciter_index];
              const surah_total = choosen_reciter.moshaf[0].surah_total;
              const menuOptions = [[{ text: "بحث", callback_data: "بحث" }], [{ text: "عرض", callback_data: "عرض" }], [{ text: "خروج", callback_data: "خروج" }]];
              const replyMarkup = {
                inline_keyboard: menuOptions,
              };
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
            const choosen_reciter = data.reciters[reciter_index];
            const reciter_surah = choosen_reciter.moshaf[0].surah_list.split(",");
    
            switch (chosenOption) {
              case 'عرض':
                reciter_surah.map(s => {
                  const surah_name = removeArabicDiacritics(quran_data.data[s - 1].name);
                  const temp_list = [{ text: `${surah_name}`, callback_data: `${s}` }];
                  menuOptions.push(temp_list);
                });
                const replyMarkup = {
                  inline_keyboard: menuOptions,
                };
                bot.sendMessage(chat_id, "السور", { reply_markup: replyMarkup });
                mood = "send";
                break;
              case 'بحث':
                bot.sendMessage(chat_id, "اكتب اسم السورة");
                mood = "search";
                bot.on("message", (msg) => {
                  if (mood === "search") {
                    const menuOptions = [[{ text: "خروج", callback_data: "خروج" }]];
                    let dosnt_exist = false;
                    reciter_surah.map(s => {
                      const surah_name = removeArabicDiacritics(quran_data.data[s - 1].name);
                      if (surah_name.includes(msg.text)) {
                        const temp_list = [{ text: `${surah_name}`, callback_data: `${s}` }];
                        menuOptions.push(temp_list);
                        dosnt_exist = false;
                      } else {
                        dosnt_exist = true;
                      }
                    });
                    const replyMarkup = {
                      inline_keyboard: menuOptions,
                    };
                    mood = "send";
                    if (menuOptions.length > 1) {
                      bot.sendMessage(chat_id, "السور", { reply_markup: replyMarkup });
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
            const chat_id = query.message.chat.id;
            const choosen_reciter = data.reciters[reciter_index];
            const reciter_server = choosen_reciter.moshaf[0].server;
            const surah_link = reciter_server + chosenOption.padStart(3, "0") + ".mp3";
    
            bot.sendAudio(chat_id, surah_link)
              .then((message) => {
                console.log("sent");
              })
              .catch((error) => {
                bot.sendMessage(chat_id, `حدث خطأ ولكن هذا هو رابط السورة ${surah_link}`);
              });
            mood = "choose_surah";
            handelChoose();
          } else if (mood === "sent" && menuOptions.length <= 1) {
            bot.sendMessage(chat_id, "السورة غير متوفرة لدى القارئ");
          }
        });
    
        const commands = [
          {
            command: "start",
            description: "رسالة الترحيب",
            RegExp: /\/start/,
          },
          {
            command: "about",
            description: "عن المبرمج",
            RegExp: /\/about/,
          },
          {
            command: "help",
            description: "مساعدة",
            RegExp: /\/help/,
          }
        ];
    
        bot.onText(commands[0].RegExp, (msg) => {
          const first_name = msg.from.first_name;
          const chatId = msg.chat.id;
          bot.sendMessage(chatId, "أهلاً بك في بوت تلاوة القرآن الكريم 📖📻 \n يمكنك اختيار القارئ ومن ثم اختيار السورة التي ترغب في الاستماع إليها.");
          mood = "choose_reciter";
          console.log(first_name);
          console.log(msg.from.username);
        });
    
        bot.onText(commands[2].RegExp, (msg) => {
          const chatId = msg.chat.id;
          bot.sendMessage(chatId, "للاستماع إلى القرآن الكريم، يرجى اتباع الخطوات التالية: \n 1. اختر القارئ من القائمة \n 2. اختر السورة التي ترغب في الاستماع إليها \n 3. استمتع بالاستماع إلى التلاوة العطرة.");
        });
        
        bot.onText(commands[1].RegExp, (msg) => {
          const chat_id = msg.chat.id;
          bot.sendMessage(chat_id, " Mustafa Gamal FrontEnd devoloper", {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'فيسبوك', url: 'https://www.facebook.com/mustafa.gamal.9231712' }],
                [{ text: "جيت هاب", url: "https://github.com/mustafagamal51112" }]
              ]
            }
          });
          mood = "choose_reciter";
        });
    
        bot.setMyCommands(commands.map(c => c));
        bot.on("polling_error", console.log);
      });
  });
