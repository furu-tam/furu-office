export function bootWolf(onChange) {
  "use strict";
  var TOTAL = 20;
  var BOT_NAMES = ["Mít Ướt","Cáo Già","Bống","Tèo Em","Chị Hằng","Sư Tử","Bé Na","Ông Bảy","Cú Mèo","Thỏ Ngọc","Gấu Trúc","Mèo Mun","Chồn Hôi","Dì Tư","Bác Ba","Cọp Con","Sóc Nhí","Vẹt Xanh","Cua Rang","Ếch Cốm","Hổ Mang","Lợn Hồng"];
  var AVA_COLORS = ["#e5484d","#4c8dff","#3fb97f","#fb923c","#a855f7","#2dd4bf","#f472b6","#f5c542","#64748b","#84cc16","#06b6d4","#f43f5e","#8b5cf6","#10b981","#f59e0b","#3b82f6","#ef4444","#14b8a6","#eab308","#6366f1"];
  var ROLES = {
    wolf:   {name:"Ma Sói",   icon:"🐺", team:"wolf",    desc:"Mỗi đêm cùng bầy chọn 1 nạn nhân. Ban ngày giả làm dân lành."},
    seer:   {name:"Tiên Tri", icon:"🔮", team:"village", desc:"Mỗi đêm soi 1 người để biết họ có phải Sói hay không."},
    guard:  {name:"Bảo Vệ",   icon:"🛡️", team:"village", desc:"Mỗi đêm che chở 1 người (có thể là chính mình), không che cùng 1 người 2 đêm liền."},
    hunter: {name:"Thợ Săn",  icon:"🏹", team:"village", desc:"Khi chết, được bắn theo 1 người bất kỳ."},
    witch:  {name:"Phù Thủy", icon:"🧙", team:"village", desc:"Có 1 thuốc cứu và 1 thuốc độc, mỗi loại dùng 1 lần trong cả ván."},
    villager:{name:"Dân Làng",icon:"🧑‍🌾", team:"village", desc:"Thảo luận ban ngày và bỏ phiếu treo cổ kẻ đáng ngờ nhất."}
  };

  var slots = []; // {name,type:'human'|'bot'|'empty',you,alive,role,ready}
  for (var i=0;i<TOTAL;i++) slots.push({name:null,type:"empty",you:false,alive:true,role:null,ready:false,votes:0});
  var mySeat = -1;
  var phase = "lobby"; // lobby | night | day | vote | hunter | ended
  var round = 0;
  var night = null; // {wolfTarget, guardTarget, seerTarget, witchSave, witchPoison}
  var witchPotions = {save:true, kill:true};
  var lastGuard = -1;
  var timerInt = null, timeLeft = 0;
  var selected = -1;
  var hunterSeat = -1;
  var votesCast = {}; // voterIdx -> targetIdx

  /* ---------- Online (PeerJS, host-authoritative) ---------- */
  var net = { mode:"solo", peer:null, code:"", conns:{}, hostConn:null, waitingSeat:-1, waitingKind:"" };
  var netReady = false;
  var guestRole = null, guestCanAct = false, guestPromptKind = "", guestWitchArm = false;
  var witchArmSeat = -1; // seat that armed poison (local you or remote witch)

  var $ = function(id){return document.getElementById(id);};
  var slotList=$("slotList"), tableWrap=$("tableWrap"), logEl=$("log");

  function initials(name){ if(!name) return "+"; var p=name.trim().split(/\s+/); return (p.length>1? p[0][0]+p[p.length-1][0] : name.slice(0,2)).toUpperCase(); }
  function aliveSeats(){ return slots.map(function(s,i){return s.type!=="empty"&&s.alive?i:-1;}).filter(function(x){return x>=0;}); }
  function seatedCount(){ return slots.filter(function(s){return s.type!=="empty";}).length; }
  function esc(t){ var d=document.createElement("div"); d.textContent=t; return d.innerHTML; }

  function log(html, cls){
    var d=document.createElement("div"); d.className="entry "+(cls||""); d.innerHTML=html;
    logEl.appendChild(d); logEl.scrollTop=logEl.scrollHeight;
    if (net.mode==="host") netSendAll({type:"log", html:html, cls:cls||""});
  }
  function logLocal(html, cls){
    var d=document.createElement("div"); d.className="entry "+(cls||""); d.innerHTML=html;
    logEl.appendChild(d); logEl.scrollTop=logEl.scrollHeight;
  }
  function sysLog(t){ log(esc(t),"sys"); }

  /* ---------- Rendering ---------- */
  function buildSeats(){
    // remove old seats
    var old = tableWrap.querySelectorAll(".seat"); old.forEach(function(n){n.remove();});
    for (var i=0;i<TOTAL;i++){
      var ang = (i/TOTAL)*Math.PI*2 - Math.PI/2;
      var x = 50 + 41.5*Math.cos(ang), y = 50 + 39.5*Math.sin(ang);
      var s = slots[i];
      var div=document.createElement("div");
      div.className="seat"+(s.type==="empty"?" empty":"")+(s.you?" you":"")+(!s.alive&&s.type!=="empty"?" dead":"")+(s.alive&&s.type!=="empty"?" alive-seat":"");
      div.style.left=x+"%"; div.style.top=y+"%"; div.dataset.idx=i;
      div.style.zIndex=Math.round(120-y); /* upper seats (and their name labels) paint over lower seats */
      var inner="";
      if (s.type==="empty"){
        inner='<button type="button" class="disc" data-seat="'+i+'" aria-label="Ngồi ghế '+(i+1)+'">+</button><div class="sname">Ghế '+(i+1)+'</div><div class="snum">trống</div>';
      } else {
        inner='<div class="zzz">💤</div><button type="button" class="disc" data-seat="'+i+'" style="background:'+AVA_COLORS[i]+'" aria-label="'+esc(s.name)+'">'+esc(initials(s.name))+'</button>'
          +'<span class="votes"></span>'
          +'<div class="sname">'+esc(s.name)+(s.you?" (bạn)":"")+'</div><div class="snum">Ghế '+(i+1)+(s.alive?"":" · đã chết")+'</div>';
      }
      div.innerHTML=inner;
      tableWrap.appendChild(div);
    }
    var discs = tableWrap.querySelectorAll("[data-seat]");
    discs.forEach(function(b){ b.addEventListener("click", function(){ onSeatClick(parseInt(b.dataset.seat,10)); }); });
    refreshTargets();
  }
  function buildSlotList(){
    slotList.innerHTML="";
    slots.forEach(function(s,i){
      var b=document.createElement("button"); b.type="button";
      b.className="slot-item"+(s.type==="empty"?" empty":"")+(s.you?" you":"")+(!s.alive&&s.type!=="empty"?" dead":"");
      if (s.type==="empty"){
        b.innerHTML='<span class="num">'+(i+1)+'</span><span class="nm">Ghế trống</span><span class="tag">TRỐNG</span>';
      } else {
        b.innerHTML='<span class="num">'+(i+1)+'</span><span class="ava" style="background:'+AVA_COLORS[i]+'">'+esc(initials(s.name))+'</span><span class="nm">'+esc(s.name)+'</span><span class="tag">'+(s.you?"BẠN":(s.type==="bot"?"BOT":"NGƯỜI"))+(s.ready?" ✔":"")+'</span>';
      }
      b.addEventListener("click", function(){ onSeatClick(i); });
      slotList.appendChild(b);
    });
    $("countChip").textContent = seatedCount()+"/20";
    $("tableAlive").textContent = phase==="lobby" ? ("Đã ngồi: "+seatedCount()+"/20 ghế") : ("Còn sống: "+aliveSeats().length+" người");
  }
  function publish(){
    if (typeof onChange!=="function") return;
    onChange({
      phase: phase, round: round, mySeat: mySeat, night: phase==="night", turn: turnId, gm: gmText,
      slots: slots.map(function(s){
        return { name:s.name, type:s.type, alive:s.alive, you:!!s.you, votes:s.votes||0 };
      })
    });
  }
  function render(){ buildSeats(); buildSlotList(); if (net.mode==="host") broadcastState(); publish(); }

  function refreshTargets(){
    var seats = tableWrap.querySelectorAll(".seat");
    seats.forEach(function(el){
      var i=parseInt(el.dataset.idx,10), s=slots[i];
      el.classList.toggle("selected", i===selected);
      var v = el.querySelector(".votes");
      if (v){ v.textContent = s.votes||0; el.classList.toggle("has-votes", phase==="vote" && s.votes>0); }
      var canTarget = false;
      if (s.type!=="empty" && s.alive){
        if (phase==="vote" && mySeat>=0 && slots[mySeat].alive) canTarget=true;
        if (phase==="night" && nightStepNeedsTarget()) canTarget=true;
        if (phase==="hunter" && mySeat===hunterSeat) canTarget=true;
        if (net.mode==="guest" && guestCanAct) canTarget=true;
      }
      el.classList.toggle("targetable", canTarget && i!==mySeat || (canTarget && phase==="night" && currentNightRole()==="guard"));
    });
  }

  function setPhaseUI(title, sub, icon, cap, chipText, nightMode){
    $("phaseTitle").textContent=title; $("phaseSub").textContent=sub;
    $("tableIcon").textContent=icon; $("tableCap").textContent=cap;
    $("phaseChip").innerHTML="Giai đoạn: <b>"+esc(chipText)+"</b>";
    $("phaseChip").classList.toggle("phase-night", !!nightMode);
    document.body.classList.toggle("night", !!nightMode);
    if (net.mode==="host") broadcastState();
  }
  function setAction(html, small){
    $("actionMsg").innerHTML = html + (small? "<small>"+small+"</small>":"");
    if (net.mode==="host") broadcastState();
  }
  var turnId = "lobby", gmText = "", gmOn = true;
  function showTurn(id){
    turnId = id || "lobby";
    var rail = $("turns");
    if (!rail) return;
    rail.hidden = turnId === "lobby";
    var order = ["wolf","guard","seer","witch","dawn","vote"];
    var at = order.indexOf(turnId);
    rail.querySelectorAll("[data-turn]").forEach(function(el){
      var key = el.getAttribute("data-turn");
      var i = order.indexOf(key);
      var hunter = key === "hunter";
      el.hidden = hunter && turnId !== "hunter";
      el.classList.toggle("now", key === turnId);
      el.classList.toggle("done", turnId === "end" ? !hunter : (at > -1 && i > -1 && i < at));
    });
  }
  function speakGm(text){
    text = (text || "").trim();
    if (!text || text === gmText) return;
    gmText = text;
    var line = $("gmLine");
    if (line){ line.hidden = false; line.textContent = text; }
    if (!gmOn || !window.speechSynthesis) return;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = "vi-VN"; u.rate = 0.95;
    var voices = speechSynthesis.getVoices();
    for (var i = 0; i < voices.length; i++) if (/^vi/i.test(voices[i].lang)){ u.voice = voices[i]; break; }
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  function announce(id, text){
    showTurn(id);
    speakGm(text);
    publish();
  }
  function showNext(show){ $("nextBtn").style.display = show? "inline-flex":"none"; }
  function showStart(show){ $("startBtn").style.display = show? "inline-flex":"none"; }
  function showWitch(show){ $("witchBtns").style.display = show? "flex":"none"; }

  /* ---------- Timer ---------- */
  function startTimer(sec, onDone){
    stopTimer(); timeLeft=sec; drawTimer();
    timerInt=setInterval(function(){ timeLeft--; drawTimer(); if(timeLeft<=0){ stopTimer(); if(onDone) onDone(); } },1000);
  }
  function stopTimer(){ if(timerInt){clearInterval(timerInt); timerInt=null;} }
  function drawTimer(){ var m=Math.floor(Math.max(timeLeft,0)/60), s=Math.max(timeLeft,0)%60; $("timer").textContent=(timeLeft>0? (m+":"+(s<10?"0":"")+s) : "--:--"); }

  /* ---------- Joining ---------- */
  function joinAt(idx, name){
    if (!netReady && net.mode==="solo"){ sysLog("Đang nối phòng… đợi một chút rồi ngồi."); return; }
    if (phase!=="lobby"){ sysLog("Ván đã bắt đầu — hãy chờ ván sau để vào ghế."); return; }
    if (mySeat>=0){ sysLog("Bạn đã có ghế rồi (ghế "+(mySeat+1)+"). Bấm “Rời ghế” nếu muốn đổi."); return; }
    if (slots[idx].type!=="empty"){ sysLog("Ghế "+(idx+1)+" đã có người ngồi."); return; }
    name = (name||"").trim() || ("Người chơi "+(idx+1));
    slots[idx]={name:name,type:"human",you:true,alive:true,role:null,ready:false,votes:0};
    mySeat=idx;
    $("meCard").style.display="block"; $("meSeat").textContent="Ghế "+(idx+1)+" — "+name;
    log("🪑 <b>"+esc(name)+"</b> đã ngồi vào <b>ghế "+(idx+1)+"</b>. Cả làng chào bạn!","sys");
    render();
  }
  function joinFirstEmpty(){
    if (net.mode==="guest"){
      if (mySeat>=0) return;
      var empty=slots.findIndex(function(s){return s.type==="empty";});
      if (empty<0){ sysLog("Phòng đã đủ 20 người!"); return; }
      if (net.hostConn){ try{ net.hostConn.send({type:"sit", idx:empty, name:($("nameInput").value||"").trim()}); }catch(e){} }
      return;
    }
    var idx=slots.findIndex(function(s){return s.type==="empty";});
    if (idx<0){ sysLog("Phòng đã đủ 20 người!"); return; }
    joinAt(idx, $("nameInput").value);
  }
  function fillBots(){
    if (phase!=="lobby") return;
    var used=slots.map(function(s){return s.name;});
    var added=0;
    for (var i=0;i<TOTAL;i++){
      if (slots[i].type==="empty"){
        var nm=BOT_NAMES.find(function(n){return used.indexOf(n)<0;}) || ("Bot "+(i+1));
        used.push(nm);
        slots[i]={name:nm,type:"bot",you:false,alive:true,role:null,ready:true,votes:0};
        added++;
      }
    }
    if (added) sysLog("🤖 Đã thêm "+added+" bot lấp kín các ghế trống.");
    render();
  }
  function leave(){
    if (mySeat<0) return;
    if (phase!=="lobby" && slots[mySeat].alive){ sysLog("Đang trong ván — không rời ghế giữa chừng được."); return; }
    if (net.mode==="guest" && net.hostConn){ try{ net.hostConn.send({type:"leave"}); }catch(e){} return; }
    slots[mySeat]={name:null,type:"empty",you:false,alive:true,role:null,ready:false,votes:0};
    log("🚪 Bạn đã rời ghế "+(mySeat+1)+".","sys"); mySeat=-1;
    $("meCard").style.display="none"; $("roleReveal").classList.remove("show");
    render();
  }

  /* ---------- Role dealing ---------- */
  function roleDeck(n){
    var wolves = n>=15?5 : n>=11?4 : n>=8?3 : n>=6?2 : 1;
    var deck=[];
    for (var i=0;i<wolves;i++) deck.push("wolf");
    if (n>=5) deck.push("seer");
    if (n>=6) deck.push("guard");
    if (n>=8) deck.push("witch");
    if (n>=9) deck.push("hunter");
    while (deck.length<n) deck.push("villager");
    // shuffle
    for (var j=deck.length-1;j>0;j--){ var k=Math.floor(Math.random()*(j+1)); var t=deck[j]; deck[j]=deck[k]; deck[k]=t; }
    return deck;
  }

  function startGame(){
    if (net.mode==="guest"){ sysLog("Chỉ chủ phòng mới bắt đầu được ván."); return; }
    if (seatedCount()<5){ sysLog("Cần tối thiểu 5 người. Hãy thêm bot để lấp phòng."); return; }
    if (mySeat<0){ sysLog("Bạn cần ngồi vào một ghế trước khi bắt đầu."); return; }
    var deck=roleDeck(seatedCount()); var d=0;
    slots.forEach(function(s){ if(s.type!=="empty"){ s.role=deck[d++]; s.alive=true; s.votes=0; } });
    witchPotions={save:true,kill:true}; lastGuard=-1; round=0; votesCast={};
    $("winBanner").className="win-banner"; $("winBanner").textContent="";
    var wolves=slots.filter(function(s){return s.role==="wolf";}).map(function(s){return s.name;});
    log("🎲 <b>Quản trò đã chia vai!</b> Bầy sói gồm "+wolves.length+" con (chỉ Sói mới biết nhau). Bấm “Xem vai của tôi” để xem vai bí mật của bạn.","sys");
    if (slots[mySeat].role==="wolf"){
      logLocal("🐺 Bạn là <b>Sói</b>! Đồng bọn của bạn: "+wolves.map(esc).join(", ")+".","night");
    }
    // send private roles to online guests
    slots.forEach(function(s){
      if (s.netConn){ try{ s.netConn.send({type:"deal", role:s.role, wolves:(s.role==="wolf"?wolves:[])}); }catch(e){} }
    });
    showStart(false); updateReveal();
    startNight();
  }

  function updateReveal(){
    var r=$("roleReveal"); if (mySeat<0||!slots[mySeat].role){ r.classList.remove("show"); return; }
    var role=ROLES[slots[mySeat].role];
    r.classList.add("show");
    r.innerHTML = role.icon+" Vai của bạn: "+role.name+"<small>"+role.desc+"</small>";
  }

  /* ---------- Night ---------- */
  var nightQueue=[], nightStep=0;
  function startNight(){
    round++; phase="night"; selected=-1; votesCast={};
    slots.forEach(function(s){ s.votes=0; });
    night={wolfTarget:-1, guardTarget:-1, seerTarget:-1, witchSave:false, witchPoison:-1};
    nightQueue=[];
    if (slots.some(function(s){return s.role==="wolf"&&s.alive;})) nightQueue.push("wolf");
    if (slots.some(function(s){return s.role==="guard"&&s.alive;})) nightQueue.push("guard");
    if (slots.some(function(s){return s.role==="seer"&&s.alive;})) nightQueue.push("seer");
    if (slots.some(function(s){return s.role==="witch"&&s.alive&&(witchPotions.save||witchPotions.kill);})) nightQueue.push("witch");
    nightStep=0;
    setPhaseUI("Đêm "+round+" — cả làng chìm vào giấc ngủ","Mọi người nhắm mắt. Quản trò sẽ lần lượt gọi Sói, Bảo vệ, Tiên tri và Phù thủy dậy trong đêm.","🌙","Đêm "+round+" · trăng tròn","Đêm "+round,true);
    log("🌙 <b>Đêm "+round+"</b> buông xuống. Cả làng nhắm mắt ngủ…","night");
    render(); runNightStep();
  }
  function currentNightRole(){ return nightQueue[nightStep]||null; }
  function nightStepNeedsTarget(){
    var r=currentNightRole(); if(!r) return false;
    if (mySeat<0) return false;
    if (r==="wolf") return slots[mySeat].role==="wolf"&&slots[mySeat].alive;
    if (r==="guard") return slots[mySeat].role==="guard"&&slots[mySeat].alive;
    if (r==="seer") return slots[mySeat].role==="seer"&&slots[mySeat].alive;
    return false; // witch uses buttons
  }
  function botPick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  function runNightStep(){
    showWitch(false); showNext(false);
    var r=currentNightRole();
    if (!r){ resolveNight(); return; }
    announce(r, r==="wolf" ? ("Đêm "+round+". Sói dậy. Chọn một người.")
      : r==="guard" ? "Bảo vệ dậy. Chọn một người để che."
      : r==="seer" ? "Tiên tri dậy. Chọn một người để soi."
      : "Phù thủy dậy. Quyết định thuốc cứu, thuốc độc, hoặc bỏ qua.");
    var deciders = aliveSeats().filter(function(i){ return slots[i].role===r; });
    var localDecider = mySeat>=0 && deciders.indexOf(mySeat)>=0;
    var remoteSeat = -1;
    deciders.forEach(function(i){ if (slots[i].netConn) remoteSeat = i; });
    var humanActs = localDecider;
    if (r==="wolf"){
      night.wolfTarget = botPick(aliveSeats().filter(function(i){return slots[i].role!=="wolf";}));
      if (humanActs){ setAction("🐺 <b>Bầy sói thức dậy.</b> Bấm vào 1 người để chọn nạn nhân đêm nay — lựa chọn của bạn sẽ quyết định thay bầy.", "Bot sói đang nghiêng về "+slots[night.wolfTarget].name+", bạn có thể đổi."); }
      else setAction("🐺 Bầy sói đang rình mồi trong bóng tối…","");
    }
    if (r==="guard"){
      var choices=aliveSeats().filter(function(i){return i!==lastGuard;});
      night.guardTarget=botPick(choices);
      if (humanActs) setAction("🛡️ <b>Bảo vệ thức dậy.</b> Bấm vào người bạn muốn che chở đêm nay (không che cùng 1 người 2 đêm liền).","");
      else setAction("🛡️ Bảo vệ lặng lẽ đi tuần quanh làng…","");
    }
    if (r==="seer"){
      var others=aliveSeats().filter(function(i){return slots[i].role!=="seer";});
      night.seerTarget=botPick(others);
      if (humanActs) setAction("🔮 <b>Tiên tri thức dậy.</b> Bấm vào 1 người để soi xem họ có phải Sói không.","");
      else setAction("🔮 Tiên tri mở mắt nhìn thấu màn đêm…","");
    }
    if (r==="witch"){
      if (humanActs){
        setAction("🧙 <b>Phù thủy thức dậy.</b> Đêm nay sói nhắm vào <b>"+(night.wolfTarget>=0?esc(slots[night.wolfTarget].name):"—")+"</b>. Dùng thuốc cứu, thuốc độc (bấm nút độc rồi chọn người), hoặc bỏ qua.",
          "Thuốc cứu còn: "+(witchPotions.save?"✔":"✖")+" · Thuốc độc còn: "+(witchPotions.kill?"✔":"✖"));
        showWitch(true);
        $("witchSaveBtn").disabled=!witchPotions.save; $("witchKillBtn").disabled=!witchPotions.kill;
      } else {
        // bot witch: often saves in rounds 1-2
        var wseat = deciders[0];
        if (wseat!==undefined && slots[wseat].type==="bot" && witchPotions.save && night.wolfTarget>=0 && round<=2 && Math.random()<0.6){ night.witchSave=true; witchPotions.save=false; }
        setAction("🧙 Phù thủy cân nhắc lọ thuốc trong tay…","");
      }
    }
    refreshTargets();
    if (!humanActs && remoteSeat>=0){
      // an online guest holds this role — prompt their device and wait for their pick
      net.waitingSeat = remoteSeat; net.waitingKind = "night";
      var promptHtml;
      if (r==="wolf") promptHtml = "🐺 <b>Bầy sói thức dậy.</b> Bấm vào 1 người (không phải sói) để chọn nạn nhân đêm nay.";
      else if (r==="guard") promptHtml = "🛡️ <b>Bảo vệ thức dậy.</b> Bấm vào người bạn muốn che chở đêm nay (không che cùng 1 người 2 đêm liền).";
      else if (r==="seer") promptHtml = "🔮 <b>Tiên tri thức dậy.</b> Bấm vào 1 người để soi xem họ có phải Sói không.";
      else promptHtml = "🧙 <b>Phù thủy thức dậy.</b> Đêm nay sói nhắm vào <b>"+(night.wolfTarget>=0?esc(slots[night.wolfTarget].name):"—")+"</b>. Dùng thuốc cứu, thuốc độc (mở độc rồi bấm chọn người), hoặc bỏ qua.";
      try{ slots[remoteSeat].netConn.send({type:"prompt", kind:(r==="witch"?"witch":"night"), role:r, html:promptHtml, potions:{save:witchPotions.save, kill:witchPotions.kill}}); }catch(e){}
      setAction("📡 Đang chờ <b>"+esc(slots[remoteSeat].name)+"</b> ("+ROLES[r].name+") hành động trong đêm…","");
      stopTimer(); $("timer").textContent="⏳";
      startTimer(45, function(){ if (net.waitingSeat===remoteSeat){ net.waitingSeat=-1; nightStep++; runNightStep(); } });
      return;
    }
    if (!humanActs){ startTimer(4, function(){ nightStep++; runNightStep(); }); }
    else { stopTimer(); $("timer").textContent="⏳"; }
  }

  function resolveNight(){
    stopTimer();
    if (night.guardTarget>=0) lastGuard=night.guardTarget;
    if (night.witchPoison>=0) witchPotions.kill=false;
    var deaths=[];
    if (night.wolfTarget>=0 && night.wolfTarget!==night.guardTarget && !night.witchSave) deaths.push({idx:night.wolfTarget, cause:"bị sói cắn trong đêm"});
    if (night.witchPoison>=0 && night.witchPoison!==night.wolfTarget && slots[night.witchPoison].alive) deaths.push({idx:night.witchPoison, cause:"trúng thuốc độc của phù thủy"});
    if (night.witchPoison>=0 && night.wolfTarget===night.witchPoison) { /* poisoned while also wolf target: already counted once */ }
    phase="day";
    announce("dawn", !deaths.length ? "Trời sáng. Đêm qua không ai chết." : "Trời sáng. "+deaths.map(function(d){ return slots[d.idx].name; }).join(" và ")+" đã chết.");
    setPhaseUI("Ngày "+round+" — trời sáng rồi!","Cả làng mở mắt. Quản trò công bố kết quả đêm qua, sau đó mọi người thảo luận trước khi bỏ phiếu.","☀️","Ngày "+round+" · bình minh","Ngày "+round,false);
    document.body.classList.remove("night");
    if (!deaths.length){
      log("☀️ <b>Ngày "+round+":</b> Đêm qua bình yên — <b>không ai chết cả!</b>","sys");
      setAction("☀️ Đêm qua không ai chết. Cả làng thảo luận rồi chuyển sang bỏ phiếu.","");
    } else {
      deaths.forEach(function(d){ killSeat(d.idx, d.cause, true); });
      setAction("☀️ Đêm qua có "+deaths.length+" người ra đi. Thảo luận xong, bấm “Bỏ phiếu treo cổ” để cả làng biểu quyết.","");
    }
    render();
    if (checkWin()) return;
    var hunterDeath = deaths.find(function(d){ return slots[d.idx].role==="hunter"; });
    if (hunterDeath && hunterDeath.idx!==mySeat && Math.random()<1){ /* bot hunter shoots in day step below */ }
    showNext(true); $("nextBtn").textContent="🗳 Bỏ phiếu treo cổ ➜";
    $("nextBtn").onclick=function(){ startVote(); };
    startTimer(30, function(){ if(phase==="day") startVote(); });
    botChatter();
  }

  function killSeat(idx, cause, announce){
    slots[idx].alive=false;
    if (announce) log("💀 <b>"+esc(slots[idx].name)+"</b> (ghế "+(idx+1)+") đã chết — "+esc(cause)+". Vai của họ là: <b>"+ROLES[slots[idx].role].icon+" "+ROLES[slots[idx].role].name+"</b>.","death");
  }

  function botChatter(){
    var lines=[
      "Đêm qua nghe tiếng tru rõ to, hướng nhà cuối làng ấy…",
      "Tui nghi người ít nói nhất tối qua giờ, im lặng đáng ngờ lắm.",
      "Ai được bảo vệ đêm qua thì lên tiếng đi, manh mối đó quý lắm.",
      "Đừng vote theo cảm tính nữa, nhìn ai hay né câu hỏi kìa.",
      "Tiên tri ơi, có soi được gì thì gợi ý khéo khéo cho làng đi."
    ];
    var speakers=aliveSeats().filter(function(i){return slots[i].type==="bot";});
    if (!speakers.length) return;
    var n=Math.min(2, speakers.length);
    for (var k=0;k<n;k++){
      (function(speaker, line, delay){
        setTimeout(function(){ if(phase==="day"||phase==="vote") log("<span class='said' style='color:"+AVA_COLORS[speaker]+"'>"+esc(slots[speaker].name)+":</span> "+esc(line)); }, delay);
      })(speakers[k], lines[Math.floor(Math.random()*lines.length)], 1200*(k+1));
    }
  }

  /* ---------- Vote ---------- */
  function startVote(){
    stopTimer(); phase="vote"; selected=-1; votesCast={};
    slots.forEach(function(s){ s.votes=0; });
    announce("vote", "Cả làng bỏ phiếu. Chọn một người để treo cổ.");
    setPhaseUI("Bỏ phiếu — ngày "+round,"Bấm vào người bạn nghi là Sói nhất để bỏ phiếu treo cổ. Bot sẽ tự bỏ phiếu khi hết giờ hoặc khi bạn đã vote.","🗳️","Biểu quyết · ngày "+round,"Bỏ phiếu",false);
    setAction("🗳️ <b>Đến giờ biểu quyết.</b> "+(mySeat>=0&&slots[mySeat].alive?"Bấm vào 1 người còn sống để bỏ phiếu.":"Bạn chỉ còn theo dõi — bot sẽ tự biểu quyết."),"Người bị nhiều phiếu nhất sẽ bị treo cổ và lộ vai.");
    log("🗳️ <b>Bỏ phiếu treo cổ — ngày "+round+"</b> bắt đầu!","sys");
    showNext(false); render();
    startTimer(25, resolveVote);
  }
  function castVote(voter, target){
    if (votesCast[voter]!==undefined){ slots[votesCast[voter]].votes--; }
    votesCast[voter]=target; slots[target].votes++;
    render();
  }
  function resolveVote(){
    if (phase!=="vote") return;
    stopTimer();
    // bots vote
    aliveSeats().forEach(function(i){
      if (slots[i].type==="bot" && votesCast[i]===undefined){
        var pool=aliveSeats().filter(function(j){ return j!==i && !(slots[i].role==="wolf"&&slots[j].role==="wolf"); });
        // wolves gang up on a non-wolf; villagers lean toward random / quiet ones
        castVoteSilent(i, botPick(pool));
      }
    });
    function castVoteSilent(v,t){ votesCast[v]=t; slots[t].votes++; }
    var tally = aliveSeats().map(function(i){return {i:i, v:slots[i].votes};}).sort(function(a,b){return b.v-a.v;});
    render();
    if (!tally.length || tally[0].v===0){ log("🤷 Không ai bị phiếu nào — hôm nay làng không treo cổ ai.","sys"); announce("vote", "Không ai bị treo cổ."); afterElimination(-1); return; }
    if (tally.length>1 && tally[1].v===tally[0].v){
      log("⚖️ Hòa phiếu "+tally[0].v+"–"+tally[1].v+"! Làng tranh cãi thêm rồi quyết định <b>không treo ai</b> hôm nay.","sys");
      announce("vote", "Hòa phiếu. Hôm nay không treo ai.");
      afterElimination(-1); return;
    }
    var out=tally[0].i;
    log("🪢 Cả làng quyết định treo cổ <b>"+esc(slots[out].name)+"</b> với "+tally[0].v+" phiếu.","death");
    announce("vote", slots[out].name+" bị treo cổ. Vai là "+ROLES[slots[out].role].name+".");
    var wasHunter = slots[out].role==="hunter";
    killSeat(out,"bị làng treo cổ",true);
    render();
    if (checkWin()) return;
    if (wasHunter){ hunterShoot(out, function(){ afterElimination(out); }); return; }
    afterElimination(out);
  }
  function afterElimination(){
    if (checkWin()) return;
    phase = "day";
    setAction("🌆 Hoàng hôn buông xuống. Chuẩn bị bước vào đêm tiếp theo…","");
    showNext(true); $("nextBtn").textContent="🌙 Vào đêm "+(round+1)+" ➜";
    $("nextBtn").onclick=function(){ showNext(false); startNight(); };
    startTimer(12, function(){ if(phase!=="night"&&phase!=="ended"){ showNext(false); startNight(); } });
    render();
  }

  function hunterShoot(hunterIdx, done){
    phase="hunter"; hunterSeat=hunterIdx;
    announce("hunter", "Thợ săn được bắn một phát cuối. Chọn một người.");
    if (slots[hunterIdx].netConn){
      net.waitingSeat=hunterIdx; net.waitingKind="hunter";
      setPhaseUI("Thợ săn rút súng!","Một người chơi online là Thợ săn đang chọn mục tiêu cuối cùng.","🏹","Phát súng cuối cùng","Thợ săn",false);
      try{ slots[hunterIdx].netConn.send({type:"prompt", kind:"hunter", role:"hunter", html:"🏹 <b>Bạn là Thợ Săn và vừa gục ngã!</b> Bấm vào 1 người còn sống để bắn theo trước khi nhắm mắt."}); }catch(e){}
      render();
      startTimer(30, function(){ if (phase==="hunter" && hunterSeat===hunterIdx){ var pool=aliveSeats(); if(pool.length){ finishHunter(botPick(pool), hunterIdx); } } });
      return;
    }
    if (hunterIdx===mySeat){
      setAction("🏹 <b>Bạn là Thợ Săn và vừa gục ngã!</b> Bấm vào 1 người còn sống để bắn theo trước khi nhắm mắt.","");
      setPhaseUI("Thợ săn rút súng!","Thợ săn được bắn theo 1 người bất kỳ.","🏹","Phát súng cuối cùng","Thợ săn",false);
      render(); return; // wait for click, handled in onSeatClick -> finishHunter
    }
    var pool=aliveSeats(); if (!pool.length){ done(); return; }
    var target=botPick(pool);
    setTimeout(function(){
      log("🏹 Thợ săn <b>"+esc(slots[hunterIdx].name)+"</b> gượng dậy bắn theo <b>"+esc(slots[target].name)+"</b>!","death");
      killSeat(target,"trúng đạn của thợ săn",true);
      phase="day"; render();
      if (!checkWin()) done();
    }, 1600);
  }
  function finishHunter(target, actor){
    if (actor===undefined) actor=mySeat;
    log("🏹 "+(actor===mySeat?"Bạn":esc(slots[actor].name))+" bắn theo <b>"+esc(slots[target].name)+"</b>!","death");
    killSeat(target,"trúng đạn của thợ săn",true);
    hunterSeat=-1; net.waitingSeat=-1; phase="day"; render();
    if (!checkWin()) afterElimination(-1);
  }

  /* ---------- Win check ---------- */
  function checkWin(){
    if (phase==="lobby") return false;
    var wolves=slots.filter(function(s){return s.type!=="empty"&&s.alive&&s.role==="wolf";}).length;
    var villagers=slots.filter(function(s){return s.type!=="empty"&&s.alive&&s.role!=="wolf";}).length;
    if (wolves===0){ endGame(true); return true; }
    if (wolves>=villagers){ endGame(false); return true; }
    return false;
  }
  function endGame(villageWin){
    phase="ended"; stopTimer(); showNext(false); showWitch(false);
    announce("end", villageWin ? "Dân làng thắng. Bầy sói đã hết." : "Ma sói thắng.");
    var b=$("winBanner");
    b.className="win-banner show "+(villageWin?"village":"wolves");
    b.textContent = villageWin? "🎉 DÂN LÀNG THẮNG! Bầy sói đã bị quét sạch khỏi làng." : "🐺 MA SÓI THẮNG! Bầy sói đã ngang hàng và nuốt trọn ngôi làng.";
    setPhaseUI(villageWin?"Kết ván — dân làng thắng!":"Kết ván — bầy sói thắng!","Toàn bộ vai đã được công khai trong danh sách ghế bên dưới.","🏁","Kết thúc ván","Kết ván",false);
    // reveal all
    slots.forEach(function(s,i){ if(s.type!=="empty") log("Ghế "+(i+1)+" — <b>"+esc(s.name)+"</b>: "+ROLES[s.role].icon+" "+ROLES[s.role].name+(s.alive?" (còn sống)":" (đã chết)"),"sys"); });
    setAction("🏁 Ván đấu kết thúc sau "+round+" đêm. Bấm “Ván mới” để xáo vai và chơi lại.","");
    showStart(true); $("startBtn").textContent="↻ Ván mới";
    render();
  }

  /* ---------- Seat clicks ---------- */
  function onSeatClick(idx){
    if (net.mode==="guest"){ guestSeatClick(idx); return; }
    handleSeatAction(idx, mySeat);
  }
  function handleSeatAction(idx, actor){
    var s=slots[idx];
    if (phase==="lobby"){ if (actor===mySeat && s.type==="empty") joinAt(idx, $("nameInput").value); return; }
    if (s.type==="empty"||!s.alive) return;
    if (actor<0 || !slots[actor].alive) return;
    if (phase==="vote"){
      if (idx===actor) return;
      if (actor===mySeat) selected=idx;
      castVote(actor, idx);
      if (actor===mySeat){
        log("🗳️ Bạn bỏ phiếu treo cổ <b>"+esc(s.name)+"</b>.","sys");
        setAction("✔ Đã ghi phiếu của bạn cho <b>"+esc(s.name)+"</b>. Đợi hết giờ hoặc bấm “Đếm phiếu ngay”.","Bạn vẫn đổi phiếu được bằng cách bấm người khác.");
        showNext(true); $("nextBtn").textContent="Đếm phiếu ngay ➜"; $("nextBtn").onclick=resolveVote;
      } else {
        log("🗳️ <b>"+esc(slots[actor].name)+"</b> đã bỏ phiếu.","sys");
      }
      refreshTargets(); render(); return;
    }
    if (phase==="hunter" && actor===hunterSeat && idx!==actor){ finishHunter(idx, actor); return; }
    if (phase==="night"){
      var r=currentNightRole(); if(!r) return;
      var isDecider = (actor===mySeat && slots[actor].role===r) || actor===net.waitingSeat;
      if (!isDecider) return;
      if (r==="wolf" && slots[actor].role==="wolf" && slots[idx].role!=="wolf"){
        night.wolfTarget=idx; if (actor===mySeat) selected=idx; refreshTargets();
        if (actor===mySeat) setAction("🐺 Bầy sói sẽ tấn công <b>"+esc(s.name)+"</b> đêm nay.","Đang chốt mục tiêu…");
        net.waitingSeat=-1; stopTimer();
        startTimer(2, function(){ nightStep++; runNightStep(); });
      }
      if (r==="guard" && slots[actor].role==="guard"){
        if (idx===lastGuard){ if (actor===mySeat) sysLog("Không che cùng 1 người 2 đêm liền — chọn người khác nhé."); else sendPrivate(actor, "🛡️ Không che cùng 1 người 2 đêm liền — chọn người khác nhé."); return; }
        night.guardTarget=idx; if (actor===mySeat) selected=idx; refreshTargets();
        net.waitingSeat=-1; stopTimer();
        startTimer(1, function(){ nightStep++; runNightStep(); });
      }
      if (r==="seer" && slots[actor].role==="seer" && idx!==actor){
        night.seerTarget=idx;
        var isWolf=slots[idx].role==="wolf";
        var msg="🔮 "+(actor===mySeat?"Bạn soi":"Kết quả soi:")+" <b>"+esc(s.name)+"</b>: người này <b>"+(isWolf?"LÀ MA SÓI 🐺":"không phải Sói ✅")+"</b>.";
        if (actor===mySeat) logLocal(msg,"night"); else sendPrivate(actor, msg);
        net.waitingSeat=-1; stopTimer();
        startTimer(2, function(){ nightStep++; runNightStep(); });
      }
      if (r==="witch" && slots[actor].role==="witch" && witchArmSeat===actor){
        night.witchPoison=idx; witchArmSeat=-1; witchPoisonArmed=false; showWitch(false);
        if (actor===mySeat) setAction("☠️ Phù thủy sẽ rải thuốc độc lên <b>"+esc(s.name)+"</b> đêm nay.","");
        net.waitingSeat=-1; stopTimer();
        startTimer(2, function(){ nightStep++; runNightStep(); });
      }
    }
  }
  function sendPrivate(seat, html){
    var c=slots[seat] && slots[seat].netConn; if(!c) return;
    try{ c.send({type:"privateLog", html:html, cls:"night"}); }catch(e){}
  }
  var witchPoisonArmed=false;

  /* ---------- Wire up ---------- */
  $("joinBtn").addEventListener("click", joinFirstEmpty);
  $("fillBtn").addEventListener("click", fillBots);
  $("leaveBtn").addEventListener("click", leave);
  $("startBtn").addEventListener("click", function(){
    slots.forEach(function(s){ s.ready = s.type!=="empty"; });
    startGame();
  });
  $("readyBtn").addEventListener("click", function(){
    if (mySeat<0) return; slots[mySeat].ready=!slots[mySeat].ready;
    if (net.mode==="guest" && net.hostConn){ try{ net.hostConn.send({type:"ready", ready:slots[mySeat].ready}); }catch(e){} }
    $("readyBtn").textContent = slots[mySeat].ready? "✔ Đã sẵn sàng" : "✔ Sẵn sàng";
    sysLog(slots[mySeat].ready? "Bạn đã sẵn sàng." : "Bạn đã hủy sẵn sàng.");
    render();
  });
  $("revealBtn").addEventListener("click", function(){
    var r=$("roleReveal");
    if (!slots[mySeat] || !slots[mySeat].role){ sysLog("Vai sẽ được chia khi ván bắt đầu."); return; }
    r.classList.toggle("show");
  });
  $("witchSaveBtn").addEventListener("click", function(){
    if (net.mode==="guest"){ guestWitchAct("save"); return; }
    if (!witchPotions.save) return;
    night.witchSave=true; witchPotions.save=false; showWitch(false);
    setAction("🧪 Bạn rắc thuốc cứu — nạn nhân của sói đêm nay sẽ được cứu sống.","");
    startTimer(2, function(){ nightStep++; runNightStep(); });
  });
  var poisonBtn=$("witchKillBtn");
  poisonBtn.addEventListener("click", function(){
    if (net.mode==="guest"){ guestWitchAct("arm"); return; }
    if (!witchPotions.kill) return;
    witchPoisonArmed=true; witchArmSeat=mySeat;
    setAction("☠️ <b>Thuốc độc đã mở nắp.</b> Bấm vào người bạn muốn đầu độc đêm nay.","Bấm “Bỏ qua” nếu đổi ý.");
  });
  $("witchSkipBtn").addEventListener("click", function(){
    if (net.mode==="guest"){ guestWitchAct("skip"); return; }
    if (witchPoisonArmed){ witchPoisonArmed=false; witchArmSeat=-1; showWitch(true); runNightStep(); return; }
    showWitch(false); nightStep++; runNightStep();
  });
  $("gmMute").addEventListener("click", function(){
    gmOn = !gmOn;
    this.setAttribute("aria-pressed", gmOn ? "true" : "false");
    this.textContent = gmOn ? "Giọng quản trò" : "Bật giọng";
    if (!gmOn && window.speechSynthesis) speechSynthesis.cancel();
  });
  if (window.speechSynthesis) speechSynthesis.getVoices();
  $("copyBtn").addEventListener("click", function(){
    var url=new URL(location.href); url.hash="";
    var code=($("roomCode").textContent||"").trim();
    if (code && code!=="----") url.searchParams.set("soi", code);
    var text=url.toString();
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    $("copyBtn").textContent="✔ Đã chép link"; setTimeout(function(){ $("copyBtn").textContent="Sao chép link mời"; },1600);
  });
  function sendChat(){
    var v=$("chatInput").value.trim(); if(!v) return;
    if (net.mode==="guest" && net.hostConn){
      try{ net.hostConn.send({type:"chat", text:v}); }catch(e){}
      $("chatInput").value=""; return;
    }
    var who = mySeat>=0? slots[mySeat].name : "Khách";
    var color = mySeat>=0? AVA_COLORS[mySeat] : "#888";
    log("<span class='said' style='color:"+color+"'>"+esc(who)+":</span> "+esc(v));
    $("chatInput").value="";
    if (phase==="day"||phase==="vote"){
      var bots=aliveSeats().filter(function(i){return slots[i].type==="bot";});
      if (bots.length && Math.random()<0.55){
        var b=botPick(bots);
        var replies=["Ừ, tui cũng đang nghi giống vậy nè.","Chưa chắc đâu, coi chừng sói đang lái dư luận đó.","Nghe hợp lý, để tui coi lại đêm qua ai im lặng nhất.","Vote theo số đông thôi, đừng chia phiếu!"];
        setTimeout(function(){ log("<span class='said' style='color:"+AVA_COLORS[b]+"'>"+esc(slots[b].name)+":</span> "+esc(botPick(replies))); }, 1100);
      }
    }
  }
  $("chatBtn").addEventListener("click", sendChat);
  $("chatInput").addEventListener("keydown", function(e){ if(e.key==="Enter") sendChat(); });
  $("nameInput").addEventListener("keydown", function(e){ if(e.key==="Enter") joinFirstEmpty(); });

  /* ---------- Online transport ---------- */
  function netSendAll(msg){
    Object.keys(net.conns).forEach(function(k){ try{ net.conns[k].send(msg); }catch(e){} });
  }
  function snapshotState(){
    return {
      phase: phase, round: round,
      title: $("phaseTitle").textContent, sub: $("phaseSub").textContent,
      icon: $("tableIcon").textContent, cap: $("tableCap").textContent,
      action: $("actionMsg").innerHTML,
      turn: turnId, gm: gmText,
      win: $("winBanner").className.indexOf("show")>=0 ? {cls:$("winBanner").className, text:$("winBanner").textContent} : null,
      slots: slots.map(function(s){
        return { name:s.name, type:s.type, alive:s.alive, ready:s.ready, votes:s.votes,
                 role: (s.type!=="empty" && (!s.alive || phase==="ended")) ? s.role : null };
      })
    };
  }
  function broadcastState(){ if (net.mode==="host") netSendAll({type:"snapshot", state:snapshotState()}); }
  function setNetStatus(html){ $("netStatus").innerHTML = html; }
  var peerOpts = { config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }], sdpSemantics: "unified-plan" }, secure: true };

  function hostWithCode(fixed){
    if (typeof Peer==="undefined"){ setNetStatus("⚠️ Không tải được thư viện kết nối. Bạn vẫn chơi được trên máy này với bot."); return; }
    if (net.mode==="host" || net.mode==="guest") return;
    var chars="ABCDEFGHJKMNPQRSTUVWXYZ23456789", code=(fixed||"").toUpperCase();
    if (code.length<4){ code=""; for (var i=0;i<4;i++) code+=chars[Math.floor(Math.random()*chars.length)]; }
    net.code=code;
    var peer=new Peer("masoi20-"+code.toLowerCase(), peerOpts);
    net.peer=peer;
    peer.on("open", function(){
      net.mode="host"; $("roomCode").textContent=code;
      var url=new URL(location.href); url.hash=""; url.searchParams.set("soi", code);
      netReady=true;
      history.replaceState(null, "", url);
      setNetStatus("📡 <b>Phòng "+code+"</b> đang mở. Bấm Mời để gửi link — bạn bè mở link là vào cùng bàn.");
      sysLog("📡 Phòng online đã mở với mã "+code+". Ngồi vào ghế, thêm bot nếu thiếu người, rồi bắt đầu ván.");
      $("hostBtn").disabled=true; $("hostBtn").textContent="📡 Phòng đang mở · "+code;
      broadcastState(); publish();
    });
    peer.on("connection", function(conn){ hostOnConn(conn); });
    peer.on("error", function(err){
      if (err.type==="unavailable-id"){
        try { peer.destroy(); } catch(e){}
        net.peer=null; net.mode="solo";
        $("codeInput").value=code;
        setNetStatus("⏳ Phòng "+esc(code)+" đã có chủ — đang vào cùng bàn…");
        guestJoin();
      } else { netReady=true; setNetStatus("⚠️ Lỗi kết nối phòng online ("+esc(err.type||"unknown")+"). Chơi trên máy này với bot vẫn bình thường."); }
    });
  }
  function hostStart(){ hostWithCode(""); }
  function hostOnConn(conn){
    var seat=-1;
    conn.on("open", function(){ net.conns[conn.peer]=conn; });
    conn.on("data", function(msg){
      if (!msg || !msg.type) return;
      if (msg.type==="hello"){
        conn.send({type:"lobby", code:net.code, phase:phase});
        try { conn.send({type:"snapshot", state:snapshotState()}); } catch(e){}
        return;
      }
      if (msg.type==="sit" && phase==="lobby"){
        if (seat>=0){ conn.send({type:"welcome", seat:seat, code:net.code}); return; }
        var want=msg.idx;
        seat=(want>=0 && slots[want] && slots[want].type==="empty") ? want : slots.findIndex(function(s){return s.type==="empty";});
        if (seat<0){ conn.send({type:"denied", reason:"Phòng đã đủ 20 người."}); return; }
        var nm=(msg.name||"").trim()||("Khách "+(seat+1));
        slots[seat]={name:nm,type:"human",you:false,alive:true,role:null,ready:false,votes:0,netConn:conn};
        conn.send({type:"welcome", seat:seat, code:net.code});
        log("🌐 <b>"+esc(nm)+"</b> vừa vào phòng và ngồi ghế "+(seat+1)+".","sys");
        render();
        return;
      }
      if (msg.type==="leave" && seat>=0 && slots[seat] && slots[seat].netConn===conn){
        if (phase!=="lobby" && slots[seat].alive){ sendPrivate(seat, "Đang trong ván — không rời ghế giữa chừng được."); return; }
        var leftName=slots[seat].name;
        slots[seat]={name:null,type:"empty",you:false,alive:true,role:null,ready:false,votes:0};
        seat=-1;
        try { conn.send({type:"left"}); } catch(e){}
        log("🚪 <b>"+esc(leftName)+"</b> đã rời ghế.","sys");
        render();
        return;
      }
      if (seat<0) return;
      if (msg.type==="wantSeat" && phase==="lobby"){
        var t=msg.idx;
        if (slots[t] && slots[t].type==="empty"){
          slots[t]=slots[seat]; slots[seat]={name:null,type:"empty",you:false,alive:true,role:null,ready:false,votes:0};
          seat=t; conn.send({type:"welcome", seat:seat, code:net.code});
          log("🪑 <b>"+esc(slots[t].name)+"</b> chuyển sang ghế "+(t+1)+".","sys"); render();
        }
      }
      if (msg.type==="chat"){
        log("<span class='said' style='color:"+AVA_COLORS[seat]+"'>"+esc(slots[seat].name)+":</span> "+esc(msg.text||""));
      }
      if (msg.type==="ready"){ slots[seat].ready=!!msg.ready; render(); }
      if (msg.type==="act"){ handleSeatAction(msg.idx, seat); }
      if (msg.type==="witchAct"){ hostWitchAct(seat, msg.act); }
    });
    conn.on("close", function(){
      delete net.conns[conn.peer];
      if (seat>=0 && slots[seat] && slots[seat].netConn===conn){
        var nm=slots[seat].name;
        if (phase==="lobby"){ slots[seat]={name:null,type:"empty",you:false,alive:true,role:null,ready:false,votes:0}; }
        else { slots[seat].type="bot"; slots[seat].netConn=null; log("📴 <b>"+esc(nm)+"</b> mất kết nối — bot sẽ chơi thay ghế này.","sys"); }
        if (net.waitingSeat===seat){ net.waitingSeat=-1; stopTimer(); if (phase==="night"){ nightStep++; runNightStep(); } }
        render();
      }
    });
  }
  function hostWitchAct(seat, act){
    if (phase!=="night" || currentNightRole()!=="witch" || net.waitingSeat!==seat) return;
    if (act==="save"){ if (!witchPotions.save) return; night.witchSave=true; witchPotions.save=false; }
    if (act==="arm"){ witchArmSeat=seat; sendPrivate(seat, "☠️ Đã mở thuốc độc — bấm vào người bạn muốn đầu độc."); return; }
    if (act==="skip"){ witchArmSeat=-1; }
    if (act==="save"||act==="skip"){ net.waitingSeat=-1; stopTimer(); startTimer(1, function(){ nightStep++; runNightStep(); }); }
  }

  function guestJoin(){
    if (net.mode==="host"){ setNetStatus("Bạn đang là chủ phòng. Bấm Mời để gửi link, không cần nhập mã."); return; }
    if (typeof Peer==="undefined"){ setNetStatus("⚠️ Không tải được thư viện kết nối (cần mạng)."); return; }
    var code=($("codeInput").value||"").trim().toUpperCase();
    if (code.length<4){ setNetStatus("Hãy nhập mã phòng 4 ký tự mà chủ phòng gửi cho bạn."); return; }
    var peer=new Peer(undefined, peerOpts); net.peer=peer; net.code=code;
    setNetStatus("⏳ Đang kết nối tới phòng "+esc(code)+"…");
    peer.on("open", function(){
      var conn=peer.connect("masoi20-"+code.toLowerCase(), {reliable:true});
      net.hostConn=conn;
      conn.on("open", function(){
        conn.send({type:"hello", name:($("nameInput").value||"").trim()});
        setNetStatus("⏳ Đã nối tới chủ phòng — đang chờ xếp ghế…");
      });
      conn.on("data", function(msg){ guestOnData(msg); });
      conn.on("close", function(){ setNetStatus("📴 Mất kết nối với chủ phòng."); net.mode="solo"; });
    });
    peer.on("error", function(err){
      netReady=true;
      if (err.type==="peer-unavailable") setNetStatus("❌ Không tìm thấy phòng <b>"+esc(code)+"</b>. Kiểm tra lại mã, hoặc chơi với bot trên máy này.");
      else setNetStatus("⚠️ Lỗi kết nối ("+esc(err.type||"unknown")+").");
    });
  }
  function guestOnData(msg){
    if (!msg || !msg.type) return;
    if (msg.type==="denied"){ setNetStatus("❌ Chủ phòng từ chối: "+esc(msg.reason||"")); return; }
    if (msg.type==="lobby"){
      net.mode="guest"; netReady=true;
      $("roomCode").textContent=msg.code||net.code;
      $("startBtn").style.display="none"; $("fillBtn").disabled=true; $("hostBtn").disabled=true; $("guestBtn").disabled=true;
      setNetStatus("✅ <b>Đã vào phòng "+esc(msg.code||"")+"</b>. Bấm một ghế trống để ngồi cùng bàn.");
      if (msg.phase && msg.phase!=="lobby") setNetStatus("Ván đang diễn ra — chờ ván sau rồi hãy ngồi.");
      return;
    }
    if (msg.type==="left"){
      mySeat=-1; $("meCard").style.display="none"; $("roleReveal").classList.remove("show"); $("joinBtn").disabled=false;
      publish(); return;
    }
    if (msg.type==="welcome"){
      net.mode="guest"; mySeat=msg.seat; guestRole=null;
      $("roomCode").textContent=msg.code||net.code;
      $("meCard").style.display="block"; $("meSeat").textContent="Ghế "+(mySeat+1)+" (phòng online "+(msg.code||"")+")";
      $("startBtn").style.display="none"; $("fillBtn").disabled=true; $("hostBtn").disabled=true; $("guestBtn").disabled=true;
      setNetStatus("✅ <b>Bạn đang ngồi ghế "+(mySeat+1)+"</b> trong phòng "+esc(msg.code||"")+". Chờ chủ phòng bắt đầu ván.");
      publish();
      return;
    }
    if (net.mode!=="guest") return;
    if (msg.type==="snapshot"){ applySnapshot(msg.state); }
    if (msg.type==="log"){ logLocal(msg.html, msg.cls); }
    if (msg.type==="privateLog"){ logLocal(msg.html, msg.cls); }
    if (msg.type==="deal"){
      guestRole=msg.role; if (mySeat>=0) slots[mySeat].role=msg.role;
      updateReveal(); $("roleReveal").classList.add("show");
      if (msg.role==="wolf" && msg.wolves && msg.wolves.length)
        logLocal("🐺 Bạn là <b>Sói</b>! Đồng bọn: "+msg.wolves.map(esc).join(", ")+".","night");
      else logLocal("🎲 Quản trò đã chia vai — xem vai bí mật của bạn ở khung bên trái.","sys");
    }
    if (msg.type==="prompt"){
      guestCanAct=true; guestPromptKind=msg.kind; guestWitchArm=false;
      setAction(msg.html, msg.kind==="witch" ? "Hành động của bạn được gửi thẳng cho chủ phòng điều phối." : "");
      if (msg.kind==="witch"){
        showWitch(true);
        $("witchSaveBtn").disabled=!(msg.potions&&msg.potions.save);
        $("witchKillBtn").disabled=!(msg.potions&&msg.potions.kill);
      }
      refreshTargets();
    }
  }
  function applySnapshot(st){
    phase=st.phase; round=st.round;
    var myRoleLocal = guestRole;
    slots = st.slots.map(function(s,i){
      return { name:s.name, type:s.type, alive:s.alive, ready:s.ready, votes:s.votes,
               role: i===mySeat ? myRoleLocal : s.role, you: i===mySeat && s.type!=="empty", netConn:null };
    });
    setPhaseUI(st.title, st.sub, st.icon, st.cap, st.phase==="lobby"?"Sảnh chờ":(st.phase==="night"?"Đêm "+st.round:st.phase==="vote"?"Bỏ phiếu":st.phase==="ended"?"Kết ván":"Ngày "+st.round), st.phase==="night");
    $("actionMsg").innerHTML=st.action;
    var b=$("winBanner");
    if (st.win){ b.className=st.win.cls; b.textContent=st.win.text; } else { b.className="win-banner"; b.textContent=""; }
    showStart(false); showNext(false);
    if (guestPromptKind!=="witch") showWitch(false);
    buildSeats(); buildSlotList();
    if (mySeat>=0 && (!slots[mySeat] || slots[mySeat].type==="empty")){ mySeat=-1; $("meCard").style.display="none"; }
    if (mySeat>=0 && slots[mySeat].type!=="empty") $("meSeat").textContent="Ghế "+(mySeat+1)+" — "+slots[mySeat].name+" (online)";
    if (st.turn) showTurn(st.turn);
    if (st.gm) speakGm(st.gm);
    publish();
  }
  function guestSeatClick(idx){
    var s=slots[idx]; if (!s) return;
    if (phase==="lobby"){
      if (s.type==="empty" && net.hostConn){
        var nm=($("nameInput").value||"").trim();
        try{ net.hostConn.send(mySeat<0 ? {type:"sit", idx:idx, name:nm} : {type:"wantSeat", idx:idx}); }catch(e){}
      }
      return;
    }
    if (s.type==="empty" || !s.alive) return;
    if (phase==="vote" || guestCanAct){
      if (net.hostConn){ try{ net.hostConn.send({type:"act", idx:idx}); }catch(e){} }
      if (guestPromptKind==="night"||guestPromptKind==="hunter"){ guestCanAct=false; guestPromptKind=""; }
      if (guestWitchArm){ guestCanAct=false; guestPromptKind=""; guestWitchArm=false; showWitch(false); }
      selected=idx; refreshTargets();
    }
  }
  function guestWitchAct(act){
    if (!net.hostConn) return;
    if (act==="arm"){ guestWitchArm=true; setAction("☠️ <b>Thuốc độc đã mở nắp.</b> Bấm vào người bạn muốn đầu độc đêm nay.",""); return; }
    try{ net.hostConn.send({type:"witchAct", act:act}); }catch(e){}
    guestCanAct=false; guestPromptKind=""; showWitch(false);
  }
  $("hostBtn").addEventListener("click", hostStart);
  $("guestBtn").addEventListener("click", guestJoin);
  $("codeInput").addEventListener("keydown", function(e){ if(e.key==="Enter") guestJoin(); });

  /* ---------- Boot ---------- */
  sysLog("Bàn tròn đã mở — ngồi ghế, đủ 5 người là chia vai ma sói. Thiếu người thì thêm bot.");
  render();
  var preset=(new URLSearchParams(location.search).get("soi")||"").replace(/[^a-zA-Z0-9]/g,"").slice(0,4).toUpperCase();
  if (typeof Peer!=="undefined") hostWithCode(preset);
  else {
    var peerScript=document.createElement("script");
    peerScript.src="vendor/peerjs/peerjs.min.js";
    peerScript.onload=function(){ if (window.Peer) hostWithCode(preset); };
    peerScript.onerror=function(){ netReady=true; setNetStatus("⚠️ Không tải được kết nối. Bạn vẫn chơi được trên máy này với bot."); };
    document.head.appendChild(peerScript);
  }
  setTimeout(function(){ if (!netReady){ netReady=true; if (net.mode==="solo") setNetStatus("Chưa nối được phòng online. Bạn vẫn ngồi và chơi với bot trên máy này."); } }, 8000);
  return { clickSeat: onSeatClick, joinFirst: joinFirstEmpty, leave: leave };
}
