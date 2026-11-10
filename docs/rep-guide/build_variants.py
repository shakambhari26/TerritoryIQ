"""Builds the Hindi and English guides from the Bengali one (rep-voice-note-guide-bn.html), so all three share one
design. Every Bengali text piece is swapped for its translation below; edit wording here, not in the generated files.

    python3 docs/rep-guide/build_variants.py && node docs/rep-guide/render.mjs

Hindi keeps the small English helper lines (like the Bengali guide). English hides them, except the three marked
"keep" that say something the main text does not. The 9 headline words stay in English in every version.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "rep-voice-note-guide-bn.html"

# (Bengali, Hindi, English), in the order they appear in the Bengali guide.
T = [
    ("Elegant Steel · সেলস টিমের জন্য", "Elegant Steel · सेल्स टीम के लिए", "Elegant Steel · for the sales team"),
    ("রাজুর", "राजू का", "Raju's"),
    ("ভয়েস নোট", "वॉइस नोट", "Voice Note"),
    ("৩০ সেকেন্ডের একটা ভালো নোট", "30 सेकंड का एक अच्छा नोट", "One good 30-second note"),
    ("= দ্রুত সাহায্য, বেশি বিক্রি", "= जल्दी मदद, ज़्यादा बिक्री", "= faster help, more sales"),
    ("হেডলাইন: ORDER", "हेडलाइन: ORDER", "Headline: ORDER"),
    ("রতন সাহা · ডিলার", "रतन साहा · डीलर", "Ratan Saha · dealer"),
    ("৫ টন · কাল", "5 टन · कल", "5 tonnes · tomorrow"),
    ("ভেতরে কী আছে / Inside", "अंदर क्या है / Inside", "Inside"),
    ("১. রাজুর খারাপ দিন · ২. রাজুর ভালো দিন", "1. राजू का बुरा दिन · 2. राजू का अच्छा दिन", "1. Raju's bad day · 2. Raju's good day"),
    ("৩. এক শব্দের ম্যাজিক: হেডলাইন · ৪. পাঁচ আঙুলের নিয়ম", "3. एक शब्द का जादू: हेडलाइन · 4. पाँच उँगलियों का नियम",
     "3. One-word magic: the headline · 4. The five-finger rule"),
    ("৫. ভালো বনাম খারাপ নোট · ৬. পকেট কার্ড", "5. अच्छा बनाम बुरा नोट · 6. पॉकेट कार्ड", "5. Good vs bad notes · 6. Pocket card"),
    ("গল্প · অধ্যায় ১", "कहानी · अध्याय 1", "Story · Chapter 1"),
    ("রাজুর খারাপ দিন", "राजू का बुरा दिन", "Raju's bad day"),
    ("১", "1", "1"),
    ("সকাল ১০টা, রতনদার দোকান", "सुबह 10 बजे, रतन दा की दुकान", "10 a.m., Ratan-da's shop"),
    ("“তিন দিন হয়ে গেল, ৫ টন রড এখনও আসেনি! SRMB বলছে কালই দেবে।”",
     "“तीन दिन हो गए, 5 टन सरिया अभी तक नहीं आया! SRMB कह रहा है कल ही दे देगा।”",
     "“Three days, and my 5 tonnes still haven't come! SRMB says they can deliver tomorrow.”"),
    ("রতনদা খুব রেগে আছেন।", "रतन दा बहुत नाराज़ हैं।", "Ratan-da is very angry."),
    ("২", "2", "2"),
    ("রাজুর তাড়া আছে", "राजू जल्दी में है", "Raju is in a hurry"),
    ("“Visit done. Discussion হলো।”", "“Visit done. Discussion हुआ।”", "“Visit done. Discussed.”"),
    ("মাত্র ৪টা শব্দ। কে? কী হলো? কত? কবে? — কিছুই নেই।", "सिर्फ़ 4 शब्द। कौन? क्या हुआ? कितना? कब? — कुछ भी नहीं।",
     "Just 4 words. Who? What happened? How much? When? — nothing."),
    ("৩", "3", "3"),
    ("হেড অফিসে নোট পৌঁছাল", "हेड ऑफ़िस में नोट पहुँचा", "The note reaches head office"),
    ("“কোন দোকান? কী সমস্যা? কিছুই বোঝা যাচ্ছে না…”", "“कौन-सी दुकान? क्या समस्या? कुछ समझ नहीं आ रहा…”",
     "“Which shop? What problem? We can't understand anything…”"),
    ("কেউ বুঝল না, তাই কেউ কিছু করল না।", "किसी को समझ नहीं आया, इसलिए किसी ने कुछ नहीं किया।", "Nobody understood, so nobody did anything."),
    ("৪", "4", "4"),
    ("এক সপ্তাহ পরে", "एक हफ़्ते बाद", "One week later"),
    ("“আমি এখন অন্য কোম্পানির রড নিচ্ছি।”", "“अब मैं दूसरी कंपनी का सरिया ले रहा हूँ।”", "“I'm buying another company's bars now.”"),
    ("রতনদা চলে গেলেন। রাজুর অর্ডার হাতছাড়া।", "रतन दा चले गए। राजू का ऑर्डर हाथ से निकल गया।", "Ratan-da left. Raju lost the order."),
    ("ছোট নোট = হারানো সুযোগ", "छोटा नोट = खोया मौका", "A short note = a lost chance"),
    ("সমস্যাটা ছোট ছিল। হেড অফিস একদিনেই ঠিক করে দিতে পারত — যদি জানত।",
     "समस्या छोटी थी। हेड ऑफ़िस एक दिन में ठीक कर सकता था — अगर उसे पता होता।",
     "The problem was small. Head office could have fixed it in one day — if they had known."),
    ("রাজুর ভয়েস নোট", "राजू का वॉइस नोट", "Raju's Voice Note"),
    ("গল্প · অধ্যায় ২", "कहानी · अध्याय 2", "Story · Chapter 2"),
    ("রাজুর ভালো দিন", "राजू का अच्छा दिन", "Raju's good day"),
    ("এবার রাজু ৩০ সেকেন্ড নিল এবং বলল:", "इस बार राजू ने 30 सेकंड लिए और कहा:", "This time Raju took 30 seconds and said:"),
    ("হেডলাইন: COMPLAINT.", "हेडलाइन: COMPLAINT.", "Headline: COMPLAINT."),
    ("রতন সাহা, ডিলার, বারাসাত।", "रतन साहा, डीलर, बारासात।", "Ratan Saha, dealer, Barasat."),
    ("৩ দিন আগে ৫ টন অর্ডার দিয়েছিলেন, রড এখনও আসেনি। উনি খুব রেগে আছেন।",
     "3 दिन पहले 5 टन का ऑर्डर दिया था, सरिया अभी तक नहीं आया। वे बहुत नाराज़ हैं।",
     "He ordered 5 tonnes 3 days ago and the bars still haven't come. He is very angry."),
    ("SRMB বলছে কালই দেবে।", "SRMB कह रहा है कल ही दे देगा।", "SRMB says they can deliver tomorrow."),
    ("আমি কাল সকাল ১১টায় আবার ফোন করব।", "मैं कल सुबह 11 बजे फिर फ़ोन करूँगा।", "I'll call him again tomorrow at 11 a.m."),
    ("১ মিনিটে বোঝা গেল", "1 मिनट में समझ आ गया", "Understood in 1 minute"),
    ("হেড অফিস সঙ্গে সঙ্গে বুঝল: দেরির অভিযোগ, ৫ টন, রাগী ডিলার।", "हेड ऑफ़िस तुरंत समझ गया: देरी की शिकायत, 5 टन, नाराज़ डीलर।",
     "Head office understood at once: late delivery, 5 tonnes, angry dealer."),
    ("পরদিন সকালে গাড়ি", "अगली सुबह गाड़ी", "A truck the next morning"),
    ("ডিপো সেদিনই অর্ডার খুঁজে পরদিন সকালে মাল পাঠাল।", "डिपो ने उसी दिन ऑर्डर ढूँढा और अगली सुबह माल भेज दिया।",
     "The depot found the order that day and delivered the next morning."),
    ("রতনদা খুশি", "रतन दा खुश", "Ratan-da is happy"),
    ("“এবার আরও ৩ টন দাও।” রতনদা থেকে গেলেন।", "“अब 3 टन और भेज दो।” रतन दा हमारे साथ रहे।", "“Send 3 more tonnes.” Ratan-da stayed with us."),
    ("একই দোকান, একই সমস্যা — শুধু নোটটা আলাদা", "वही दुकान, वही समस्या — बस नोट अलग था", "Same shop, same problem — only the note was different"),
    ("রঙিন অংশগুলো দেখুন। প্রতিটা রঙ একটা প্রশ্নের উত্তর। পরের পাতাগুলোতে শিখব কীভাবে।",
     "रंगीन हिस्से देखिए। हर रंग एक सवाल का जवाब है। अगले पन्नों में सीखेंगे कैसे।",
     "Look at the coloured parts. Each colour answers one question. The next pages show you how."),
    ("ধাপ ১ · Step 1", "चरण 1 · Step 1", "Step 1"),
    ("এক শব্দের ম্যাজিক:", "एक शब्द का जादू:", "One-word magic:"),
    ("হেডলাইন", "हेडलाइन", "Headline"),
    ("প্রতিটা নোট শুরু করুন", "हर नोट शुरू कीजिए", "Start every note by saying"),
    ("“হেডলাইন”", "“हेडलाइन”", "“Headline”"),
    ("বলে, তারপর নিচের", "बोलकर, फिर नीचे दिए", ", then"),
    ("৯টা শব্দের একটা", "9 शब्दों में से एक", "one of the 9 words below"),
    ("— ইংরেজিতেই বলুন, ঠিক যেমন লেখা আছে।", "बोलिए — अंग्रेज़ी में, बिल्कुल जैसा लिखा है।", "— in English, exactly as written."),
    ("কাস্টমার কিনতে চান বা অর্ডার দিয়েছেন।", "ग्राहक ख़रीदना चाहते हैं या ऑर्डर दे दिया।", "The customer wants to buy, or has ordered."),
    ("টাকা নেওয়া হলো, বা টাকা বাকি আছে।", "पैसे मिले, या पैसे बाकी हैं।", "Money collected, or money still due."),
    ("অন্য ব্র্যান্ড সস্তা দিচ্ছে বা কাস্টমার অন্য ব্র্যান্ড নিচ্ছেন।", "दूसरा ब्रांड सस्ता दे रहा है या ग्राहक दूसरा ब्रांड ले रहे हैं।",
     "Another brand is cheaper, or the customer uses another brand."),
    ("মাল দেরিতে, খারাপ মাল, বা কাস্টমার অখুশি।", "माल देर से, ख़राब माल, या ग्राहक नाख़ुश।", "Late delivery, bad material, or an unhappy customer."),
    ("বাড়ি বা বিল্ডিং-এর কাজ চলছে বা শুরু হবে — রড লাগবে।", "घर या बिल्डिंग का काम चल रहा है या शुरू होगा — सरिया लगेगा।",
     "A house or building is going up or starting soon — it will need bars."),
    ("নতুন দোকান, নতুন মিস্ত্রি, নতুন কাস্টমার।", "नई दुकान, नया मिस्त्री, नया ग्राहक।", "A new shop, a new mason, a new customer."),
    ("ইঞ্জিনিয়ার বা টেকনিক্যাল সাহায্য লাগবে।", "इंजीनियर या टेक्निकल मदद चाहिए।", "They need an engineer or technical help."),
    ("কাস্টমার খুশি, আমাদের প্রশংসা করছেন।", "ग्राहक खुश हैं, हमारी तारीफ़ कर रहे हैं।", "The customer is happy and praising us."),
    ("দেখা হলো, কিন্তু কিছুই হলো না।", "मुलाक़ात हुई, पर कुछ नहीं हुआ।", "You met them, but nothing came of it."),
    ("দুটো ব্যাপার হলে?", "दो बातें हुईं तो?", "Two things happened?"),
    ("সবচেয়ে জরুরিটা আগে বলুন। অভিযোগ + নতুন অর্ডার হলে:", "सबसे ज़रूरी बात पहले बोलिए। शिकायत + नया ऑर्डर हो तो:",
     "Say the most urgent one first. A complaint plus a new order:"),
    ("“হেডলাইন: COMPLAINT”", "“हेडलाइन: COMPLAINT”", "“Headline: COMPLAINT”"),
    (", তারপর নোটে অর্ডারের কথা বলুন।", ", फिर नोट में ऑर्डर की बात बताइए।", ", then mention the order in the note."),
    ("কেন ইংরেজি শব্দ?", "अंग्रेज़ी शब्द क्यों?", "Why English words?"),
    ("কম্পিউটার এই ৯টা শব্দ ঠিকঠাক চেনে। বাকি নোট বাংলা, হিন্দি বা ইংরেজি — যেভাবে সুবিধা।",
     "कंप्यूटर इन 9 शब्दों को ठीक से पहचानता है। बाकी नोट बांग्ला, हिंदी या अंग्रेज़ी में — जैसे आसान लगे।",
     "The computer recognises these 9 words exactly. The rest of the note can be in Bengali, Hindi or English — whatever is easiest."),
    ("ধাপ ২ · Step 2", "चरण 2 · Step 2", "Step 2"),
    ("পাঁচ আঙুলের নিয়ম", "पाँच उँगलियों का नियम", "The five-finger rule"),
    ("হেডলাইনের পরে, হাতের ৫টা আঙুল গুনে ৫টা প্রশ্নের উত্তর দিন। প্রতিটা আঙুল = ২ নম্বর। ৫ আঙুল =",
     "हेडलाइन के बाद, हाथ की 5 उँगलियाँ गिनकर 5 सवालों के जवाब दीजिए। हर उँगली = 2 अंक। 5 उँगलियाँ =",
     "After the headline, count the 5 fingers of your hand and answer 5 questions. Each finger = 2 points. 5 fingers ="),
    ("১০/১০", "10/10", "10/10"),
    ("৫", "5", "5"),
    ("কে?", "कौन?", "Who?"),
    ("কাস্টমারের নাম + উনি কে: ডিলার, রিটেলার, মিস্ত্রি, ইঞ্জিনিয়ার, বাড়ির মালিক।",
     "ग्राहक का नाम + वे कौन हैं: डीलर, रिटेलर, मिस्त्री, इंजीनियर, मकान मालिक।",
     "The customer's name and who they are: dealer, retailer, mason, engineer, house owner."),
    ("কী হলো?", "क्या हुआ?", "What happened?"),
    ("আসল কথাটা এক লাইনে: অর্ডার দিলেন, টাকা দিলেন, অভিযোগ করলেন…", "असली बात एक लाइन में: ऑर्डर दिया, पैसे दिए, शिकायत की…",
     "The real result in one line: ordered, paid, complained…"),
    ("কত?", "कितना?", "How much?"),
    ("সংখ্যা বলুন! কত টন, কত টাকা, কত শতাংশ। কিছু না হলে বলুন “অর্ডার হয়নি”।",
     "संख्या बोलिए! कितने टन, कितने रुपये, कितने प्रतिशत। कुछ नहीं हुआ तो बोलिए “ऑर्डर नहीं हुआ”।",
     "Say numbers! How many tonnes, how many rupees, what percent. If nothing, say “no order”."),
    ("কোন ব্র্যান্ড?", "कौन-सा ब्रांड?", "Which brand?"),
    ("আমাদের রড, না অন্য কারো? অন্য হলে নাম বলুন — SRMB, Tata Tiscon, যেটাই হোক।",
     "हमारा सरिया, या किसी और का? और का हो तो नाम बोलिए — SRMB, Tata Tiscon, जो भी हो।",
     "Our bars, or someone else's? If another brand, name it — SRMB, Tata Tiscon, whichever."),
    ("কবে?", "कब?", "When?"),
    ("পরের কাজ কী আর কবে: “কাল ১১টায় ফোন”, “সোমবার মাল যাবে”, “১০ তারিখে টাকা”।",
     "अगला काम क्या और कब: “कल 11 बजे फ़ोन”, “सोमवार को माल जाएगा”, “10 तारीख़ को पैसे”।",
     "What happens next and when: “call tomorrow at 11”, “delivery on Monday”, “payment on the 10th”."),
    ("মনে রাখার ছড়া:", "याद रखने की तुकबंदी:", "Rhyme to remember:"),
    ("“কে, কী, কত, কোনটা, কবে — পাঁচ আঙুলে নোট ভালো হবে!”", "“कौन, क्या, कितना, कौन-सा, कब — पाँच उँगलियों से नोट बने बढ़िया अब!”",
     "“Who, what, how much, which brand, when — five fingers make a perfect ten!”"),
    ("ধাপ ৩ · Step 3", "चरण 3 · Step 3", "Step 3"),
    ("খারাপ নোট বনাম ভালো নোট", "बुरा नोट बनाम अच्छा नोट", "Bad note vs good note"),
    ("✗ খারাপ", "✗ बुरा", "✗ Bad"),
    ("২/১০", "2/10", "2/10"),
    ("“Payment follow-up করলাম।”", "“Payment follow-up किया।”", "“Did payment follow-up.”"),
    ("✓ ভালো", "✓ अच्छा", "✓ Good"),
    ("হেডলাইন: PAYMENT.", "हेडलाइन: PAYMENT.", "Headline: PAYMENT."),
    ("সমীর দাস, ডিলার, মা তারা ট্রেডার্স। ২ লাখ টাকা বাকি ছিল, আজ ৫০ হাজার দিলেন। বাকিটা ১০ তারিখে দেবেন। আমাদের রড নিয়ে খুশি।”",
     "समीर दास, डीलर, माँ तारा ट्रेडर्स। 2 लाख रुपये बाकी थे, आज 50 हज़ार दिए। बाकी 10 तारीख़ को देंगे। हमारे सरिये से खुश हैं।”",
     "Samir Das, dealer, Maa Tara Traders. 2 lakh rupees was due; he paid 50 thousand today, the rest on the 10th. Happy with our bars.”"),
    ("১/১০", "1/10", "1/10"),
    ("“Site visit. Discussion হলো।”", "“Site visit. Discussion हुआ।”", "“Site visit. Discussed.”"),
    ("হেডলাইন: SITE.", "हेडलाइन: SITE.", "Headline: SITE."),
    ("মিস্ত্রি বাপি মণ্ডল, ব্যারাকপুর। জি+২ বাড়ির ঢালাই শুরু হবে ১৫ তারিখে, প্রায় ৮ টন রড লাগবে। এখন Tata দেখছেন। সোমবার রেট নিয়ে আবার যাব।”",
     "मिस्त्री बापी मंडल, बैरकपुर। G+2 मकान की ढलाई 15 तारीख़ से शुरू होगी, क़रीब 8 टन सरिया लगेगा। अभी Tata देख रहे हैं। सोमवार को रेट लेकर फिर जाऊँगा।”",
     "Mason Bapi Mondal, Barrackpore. Casting for a G+2 house starts on the 15th; about 8 tonnes needed. Looking at Tata now. I'll go back on Monday with our rate.”"),
    ("৩/১০", "3/10", "3/10"),
    ("হেডলাইন: COMPETITOR.", "हेडलाइन: COMPETITOR.", "Headline: COMPETITOR."),
    ("রিটেলার অমল ঘোষ, বনগাঁ। বলছেন SRMB টন প্রতি ৮০০ টাকা কম দিচ্ছে। এই মাসে ৩ টন লাগবে। বৃহস্পতিবারের মধ্যে রেট জানাতে হবে।”",
     "रिटेलर अमल घोष, बनगाँव। कह रहे हैं SRMB प्रति टन 800 रुपये कम दे रहा है। इस महीने 3 टन चाहिए। गुरुवार तक रेट बताना है।”",
     "Retailer Amal Ghosh, Bongaon. Says SRMB is 800 rupees a tonne cheaper. Needs 3 tonnes this month. We must give our rate by Thursday.”"),
    ("ভালো নোট লম্বা নয় — ভালো নোট পরিষ্কার। ৩০ সেকেন্ডই যথেষ্ট।", "अच्छा नोट लंबा नहीं — अच्छा नोट साफ़ होता है। 30 सेकंड काफ़ी हैं।",
     "A good note isn't long — it's clear. 30 seconds is enough."),
    ("৬", "6", "6"),
    ("নমুনা · Examples", "नमूने · Examples", "Examples"),
    ("প্রতিটা হেডলাইনের একটা নমুনা", "हर हेडलाइन का एक नमूना", "One sample for every headline"),
    ("“হেডলাইন: ORDER. ডিলার সুভাষ পাল, হাবড়া। ১০ মিমি ৪ টন অর্ডার কনফার্ম। বুধবার ডেলিভারি চাই।”",
     "“हेडलाइन: ORDER. डीलर सुभाष पाल, हाबरा। 10 मिमी 4 टन ऑर्डर कन्फ़र्म। बुधवार को डिलीवरी चाहिए।”",
     "“Headline: ORDER. Dealer Subhash Pal, Habra. 4 tonnes of 10 mm confirmed. Wants delivery on Wednesday.”"),
    ("“হেডলাইন: PAYMENT. রিটেলার শ্যামল দে। ৮০ হাজার বাকি, আজ ৩০ হাজার দিলেন, বাকি শনিবার।”",
     "“हेडलाइन: PAYMENT. रिटेलर श्यामल दे। 80 हज़ार बाकी, आज 30 हज़ार दिए, बाकी शनिवार को।”",
     "“Headline: PAYMENT. Retailer Shyamal De. 80 thousand due; paid 30 thousand today, the rest on Saturday.”"),
    ("“হেডলাইন: COMPETITOR. মিস্ত্রি রবি সাউ। সাইটে Tata Tiscon ব্যবহার করছেন, বলছেন ওদের রড বেশি সোজা। শুক্রবার আমাদের স্যাম্পল দেখাব।”",
     "“हेडलाइन: COMPETITOR. मिस्त्री रवि साव। साइट पर Tata Tiscon इस्तेमाल कर रहे हैं, कहते हैं उनका सरिया ज़्यादा सीधा है। शुक्रवार को हमारा सैंपल दिखाऊँगा।”",
     "“Headline: COMPETITOR. Mason Ravi Shaw. Using Tata Tiscon at the site; says their bars are straighter. I'll show our sample on Friday.”"),
    ("“হেডলাইন: COMPLAINT. ডিলার মনোজ সাহা। গত চালানে ২ বান্ডিল রডে জং। ছবি তুলে পাঠাচ্ছি। কালকের মধ্যে বদলাতে হবে।”",
     "“हेडलाइन: COMPLAINT. डीलर मनोज साहा। पिछले चालान में 2 बंडल सरिये में जंग। फ़ोटो भेज रहा हूँ। कल तक बदलना है।”",
     "“Headline: COMPLAINT. Dealer Manoj Saha. 2 bundles in the last delivery are rusted. Sending photos. Must be replaced by tomorrow.”"),
    ("“হেডলাইন: SITE. বাড়ির মালিক অনিতা বিশ্বাস, নৈহাটি। পরের মাসে ছাদ ঢালাই, প্রায় ৬ টন লাগবে। ১ তারিখে আবার যাব।”",
     "“हेडलाइन: SITE. मकान मालिक अनीता बिस्वास, नैहाटी। अगले महीने छत की ढलाई, क़रीब 6 टन लगेगा। 1 तारीख़ को फिर जाऊँगा।”",
     "“Headline: SITE. House owner Anita Biswas, Naihati. Roof casting next month; needs about 6 tonnes. I'll go back on the 1st.”"),
    ("“হেডলাইন: NEW CUSTOMER. নতুন হার্ডওয়্যার দোকান, মা দুর্গা স্টোর্স, মালিক তপন কর। প্রথমে ২ টন নিতে চান। সোমবার রেট দেব।”",
     "“हेडलाइन: NEW CUSTOMER. नई हार्डवेयर दुकान, माँ दुर्गा स्टोर्स, मालिक तपन कर। पहले 2 टन लेना चाहते हैं। सोमवार को रेट दूँगा।”",
     "“Headline: NEW CUSTOMER. New hardware shop, Maa Durga Stores, owner Tapan Kar. Wants 2 tonnes to start. I'll give our rate on Monday.”"),
    ("“হেডলাইন: ENGINEER. ইঞ্জিনিয়ার সুমন রায়, সরকারি স্কুল প্রজেক্ট। রডের টেস্ট সার্টিফিকেট চাইছেন। এই সপ্তাহে আমাদের ইঞ্জিনিয়ার পাঠাতে হবে।”",
     "“हेडलाइन: ENGINEER. इंजीनियर सुमन राय, सरकारी स्कूल प्रोजेक्ट। सरिये का टेस्ट सर्टिफ़िकेट माँग रहे हैं। इस हफ़्ते हमारा इंजीनियर भेजना है।”",
     "“Headline: ENGINEER. Engineer Suman Roy, government school project. Wants the test certificate for our bars. We must send our engineer this week.”"),
    ("“হেডলাইন: HAPPY. মিস্ত্রি কালু শেখ। আমাদের রডে খুব খুশি, আরও ৩ জন মিস্ত্রিকে বলবেন। পরের মাসে মিস্ত্রি মিটিং-এ আসবেন।”",
     "“हेडलाइन: HAPPY. मिस्त्री कालू शेख। हमारे सरिये से बहुत खुश, 3 और मिस्त्रियों को बताएँगे। अगले महीने मिस्त्री मीटिंग में आएँगे।”",
     "“Headline: HAPPY. Mason Kalu Sheikh. Very happy with our bars; will tell 3 more masons. Coming to the masons' meeting next month.”"),
    ("“হেডলাইন: NO RESULT. রিটেলার বিপ্লব দাস। দোকান বন্ধ ছিল, ফোনে কথা হলো, এখন কিছু লাগবে না। ১৫ দিন পরে আবার যাব।”",
     "“हेडलाइन: NO RESULT. रिटेलर बिप्लब दास। दुकान बंद थी, फ़ोन पर बात हुई, अभी कुछ नहीं चाहिए। 15 दिन बाद फिर जाऊँगा।”",
     "“Headline: NO RESULT. Retailer Biplab Das. Shop was closed; spoke on the phone; needs nothing now. I'll go back in 15 days.”"),
    ("৭", "7", "7"),
    ("মনে রাখুন · Remember", "याद रखिए · Remember", "Remember"),
    ("এগুলো করবেন, এগুলো করবেন না", "ये कीजिए, ये मत कीजिए", "Do this, not that"),
    ("✓ করবেন", "✓ कीजिए", "✓ Do"),
    ("দোকান থেকে বেরিয়েই রেকর্ড করুন, কথা মনে থাকতে থাকতে।", "दुकान से निकलते ही रिकॉर्ड कीजिए, जब तक बात याद है।",
     "Record as soon as you leave the shop, while you still remember."),
    ("শান্ত জায়গায় দাঁড়িয়ে, ফোন মুখের কাছে রেখে বলুন।", "शांत जगह खड़े होकर, फ़ोन मुँह के पास रखकर बोलिए।",
     "Stand somewhere quiet and hold the phone close to your mouth."),
    ("সংখ্যা স্পষ্ট করে বলুন: “চার টন”, “পঞ্চাশ হাজার”।", "संख्या साफ़ बोलिए: “चार टन”, “पचास हज़ार”।",
     "Say numbers clearly: “four tonnes”, “fifty thousand”."),
    ("প্রতিটা দোকানের জন্য আলাদা নোট।", "हर दुकान के लिए अलग नोट।", "One note for each shop."),
    ("কিছু না হলেও সত্যি বলুন: “হেডলাইন: NO RESULT”।", "कुछ न हुआ हो तो भी सच बोलिए: “हेडलाइन: NO RESULT”।",
     "Nothing happened? Say so honestly: “Headline: NO RESULT”."),
    ("✗ করবেন না", "✗ मत कीजिए", "✗ Don't"),
    ("৮ শব্দের কম নোট — “Visit done” কাজে আসে না।", "8 शब्दों से छोटा नोट — “Visit done” किसी काम का नहीं।",
     "Notes under 8 words — “Visit done” is no use."),
    ("“The client”, “customer” — নাম না বলা।", "“The client”, “customer” — नाम न बोलना।", "Saying “the client” or “customer” instead of the name."),
    ("রাস্তার গাড়ির আওয়াজের মধ্যে রেকর্ড।", "सड़क की गाड़ियों के शोर में रिकॉर्ड करना।", "Recording in traffic noise."),
    ("দুটো দোকানের কথা একটা নোটে।", "दो दुकानों की बात एक नोट में।", "Two shops in one note."),
    ("বানানো কথা। ভুল তথ্যে হেড অফিস ভুল সিদ্ধান্ত নেয়।", "मनगढ़ंत बातें। ग़लत जानकारी से हेड ऑफ़िस ग़लत फ़ैसला लेता है।",
     "Made-up details. Wrong information leads head office to wrong decisions."),
    ("রাজু বলছে: “আপনার নোট কম্পিউটার পড়ে, তারপর সঠিক মানুষের কাছে পৌঁছে দেয়।”",
     "राजू कहता है: “आपका नोट कंप्यूटर पढ़ता है, फिर सही आदमी तक पहुँचाता है।”",
     "Raju says: “The computer reads your note, then passes it to the right person.”"),
    ("অভিযোগ গেলে ডিপোতে, টাকার কথা গেলে অ্যাকাউন্টসে, নতুন সাইট গেলে সেলস ম্যানেজারের কাছে। হেডলাইন যত পরিষ্কার, সাহায্য তত তাড়াতাড়ি।",
     "शिकायत डिपो तक, पैसों की बात अकाउंट्स तक, नई साइट सेल्स मैनेजर तक। हेडलाइन जितनी साफ़, मदद उतनी जल्दी।",
     "Complaints go to the depot, money to accounts, new sites to the sales manager. The clearer the headline, the faster the help."),
    ("৮", "8", "8"),
    ("কেটে পকেটে রাখুন · Cut out and keep", "काटकर जेब में रखिए · Cut out and keep", "Cut out and keep"),
    ("পকেট কার্ড", "पॉकेट कार्ड", "Pocket card"),
    ("৩০ সেকেন্ডের নোট", "30 सेकंड का नोट", "The 30-second note"),
    ("কে", "कौन", "Who"),
    ("কী হলো", "क्या हुआ", "What happened"),
    ("কত", "कितना", "How much"),
    ("কোন ব্র্যান্ড", "कौन-सा ब्रांड", "Which brand"),
    ("কবে", "कब", "When next"),
    ("হেডলাইন শব্দ:", "हेडलाइन शब्द:", "Headline words:"),
    ("নিজেকে ৩টা প্রশ্ন · Ask yourself 3 things", "ख़ुद से 3 सवाल · Ask yourself 3 things", "Ask yourself 3 things"),
    ("১. হেডলাইন বলেছি?&nbsp;&nbsp; ২. কোনো সংখ্যা বলেছি?&nbsp;&nbsp; ৩. পরের তারিখ বলেছি?",
     "1. हेडलाइन बोली?&nbsp;&nbsp; 2. कोई संख्या बोली?&nbsp;&nbsp; 3. अगली तारीख़ बोली?",
     "1. Did I say the headline?&nbsp;&nbsp; 2. A number?&nbsp;&nbsp; 3. The next date?"),
    ("৯", "9", "9"),
    ("শেষ কথা · Last word", "आख़िरी बात · Last word", "Last word"),
    ("আপনার নোট,", "आपका नोट,", "Your note,"),
    ("আপনার জয়", "आपकी जीत", "your win"),
    ("দ্রুত সাহায্য", "जल्दी मदद", "Faster help"),
    ("পরিষ্কার নোট মানে ডিপো, অ্যাকাউন্টস আর ম্যানেজার একদিনেই কাজে নামে।",
     "साफ़ नोट का मतलब डिपो, अकाउंट्स और मैनेजर उसी दिन काम में लग जाते हैं।",
     "A clear note gets the depot, accounts and managers moving the same day."),
    ("কাস্টমার থাকে", "ग्राहक बना रहता है", "Customers stay"),
    ("সমস্যা তাড়াতাড়ি মিটলে কাস্টমার অন্য ব্র্যান্ডে যান না।", "समस्या जल्दी सुलझे तो ग्राहक दूसरे ब्रांड पर नहीं जाते।",
     "When problems are fixed fast, customers don't switch brands."),
    ("কম ফোন কল", "कम फ़ोन कॉल", "Fewer phone calls"),
    ("নোটে সব থাকলে হেড অফিসকে আর ফোন করে জিজ্ঞেস করতে হয় না।", "नोट में सब हो तो हेड ऑफ़िस को फ़ोन करके पूछना नहीं पड़ता।",
     "When the note has everything, head office doesn't need to call and ask."),
    ("আপনার কাজ চোখে পড়ে", "आपका काम सबको दिखता है", "Your work gets noticed"),
    ("প্রতিটা অর্ডার, প্রতিটা নতুন সাইট — আপনার নামে লেখা থাকে।", "हर ऑर्डर, हर नई साइट — आपके नाम पर दर्ज होती है।",
     "Every order and every new site is recorded in your name."),
    ("“আজ থেকে প্রতিটা নোট:", "“आज से हर नोट:", "“From today, every note:"),
    ("পাঁচ আঙুল", "पाँच उँगलियाँ", "five fingers"),
    ("। ৩০ সেকেন্ড। ব্যস!”", "। 30 सेकंड। बस!”", ". 30 seconds. That's it!”"),
]

LANGS = {
    "hi": {"col": 1, "title": "राजू का वॉइस नोट · Raju's Voice Note", "display": "Baloo 2", "body": "Hind",
           "fonts": "family=Baloo+2:wght@500;700;800&family=Hind:wght@400;500;600;700", "extra_css": ""},
    "en": {"col": 2, "title": "Raju's Voice Note", "display": "Baloo 2", "body": "Hind",
           "fonts": "family=Baloo+2:wght@500;700;800&family=Hind:wght@400;500;600;700",
           # The small English helper lines repeat the main text here, except the three marked "keep".
           "extra_css": "  .en:not(.keep) { display: none; }\n"},
}
BENGALI = re.compile(r"[ঀ-৿]")


def build(lang: str) -> str:
    cfg = LANGS[lang]
    table = {bn: row[cfg["col"]] for row in T for bn in [row[0]]}
    html = SOURCE.read_text()

    def swap(m: re.Match) -> str:
        raw = m.group(1)
        text = raw.strip()
        if not BENGALI.search(text):
            return m.group(0)
        if text not in table:
            raise KeyError(f"No {lang} translation for: {text!r}")
        new = table[text]
        lead = "" if new[:1] in ",.;:।" else raw[: len(raw) - len(raw.lstrip())]
        return f">{lead}{new}{raw[len(raw.rstrip()):]}<"

    head, body = html.split("<body>", 1)
    body = re.sub(r">([^<>]*)<", swap, body)
    if lang == "en":
        body = re.sub(r">([^<>]*)<", lambda m: ">" + m.group(1).replace("।", ".") + "<", body)  # the Indic full stop
    html = head + "<body>" + body
    html = html.replace('<html lang="bn">', f'<html lang="{lang}">')
    html = re.sub(r"<title>.*?</title>", f"<title>{cfg['title']}</title>", html)
    html = re.sub(r"family=Baloo\+Da\+2[^&]*&family=Hind\+Siliguri:[^&\"]*", cfg["fonts"], html)
    html = html.replace("Baloo Da 2", cfg["display"]).replace("Hind Siliguri", cfg["body"])
    html = html.replace("<!-- Bengali guide, and the source of the Hindi and English ones: python3 docs/rep-guide/build_variants.py, then node docs/rep-guide/render.mjs -->",
                        f"<!-- GENERATED from rep-voice-note-guide-bn.html by build_variants.py ({lang}). Do not edit. -->")
    html = html.replace("</style>", cfg["extra_css"] + "</style>", 1)
    leftover = BENGALI.findall(re.sub(r"<style.*?</style>", "", html, flags=re.S))
    if leftover:
        raise ValueError(f"{lang}: Bengali text left untranslated")
    return html


if __name__ == "__main__":
    for lang in LANGS:
        (HERE / f"rep-voice-note-guide-{lang}.html").write_text(build(lang))
        print(f"wrote rep-voice-note-guide-{lang}.html")
