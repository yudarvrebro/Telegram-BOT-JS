# Telegram-BOT-JS
  Telegram bot is created using pure JavaScript code, without libraries, etc.

# The functionality of this bot works as follows:
1) The user sends only one message (/start does not count as 1st message) – it goes to the administration panel (HTML).
2) The administrator clicks "Load Users" - a list of senders is displayed.
3) There are two buttons available for each user ("Confirm" is a mark that the message has been read ,  "Clear" – removes the user from the chat history.)

# This code is hosted on the Cloudflare platform in workers. The main advantages of this platform are:
1) Free plan (up to 100,000 requests per day)
2) Global delivery network
3) Integration with KV storage (for storing messages)
4) Easy to Deploy

# Stages of creating a worker -
- First, let's create a bot in Telegram using - @BotFather and get a token -
- Next we will create a worker -
  Workers & Pages => Start with Hello World! => insert code from worker.js => Deploy
- Next we create a BOT_TOKEN so that no one can see it and recognize it -
  Settings => Variables => Add => name it BOT_TOKEN => and assign it the value of the token that the bot issued - @BotFather 
- Let's create a KV storage to store received user messages -
  Cloudflare => Workers => your Worker => Settings => Bindings => KV Namespace => we call it - MESSAGES
- Connecting KV to WORKER -
  Worker => Bindings => Add Bindings => KV - MESSAGES
- we paste the code into our worker and get the admin panel (It is worth checking for errors - HTTP should be 200)

# Key lines of code:

  1) Processing webhook from Telegram
     --- if (path === "/webhook" && request.method === "POST") {
  2) Check for first message
     --- if (typeof textOrCaption === "string" && textOrCaption.trim().startsWith("/start")) {
  3) Blocking duplicate messages
     --- if (await env.MESSAGES.get(`sent:${userId}`)) {
  4) Saving message data
     --- await env.MESSAGES.put(`msg:${userId}`, JSON.stringify(record));
  5) Collecting attachments
     --- const largest = msg.photo[msg.photo.length - 1];
  6) Generate URL files
     --- f.url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${tgJson.result.file_path}`;
  7) Sending to Telegram
     --- await fetch(`https://api.telegram.org/bot${token}/sendMessage`, ...)
  8) Admin panel
     --- return new Response(ADMIN_HTML, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
  9) Deleting a user
     --- await env.MESSAGES.delete(`msg:${userId}`);
  10) CORS headers
     ---"Access-Control-Allow-Origin": "*",

# As a result, we get an antispam bot that accepts and saves in KV only 1 user message:

From the user's side:

<img width="608" height="500" alt="483y38744384" src="https://github.com/user-attachments/assets/442681f4-a439-4246-9b1b-fce5a9012fb5" />


From the admin panel:

<img width="1498" height="500" alt="98576294" src="https://github.com/user-attachments/assets/eb3b037a-f04f-4f93-9c95-b3aae0b3d8b5" />


# My video profile - https://guns.lol/yudarvrebro
