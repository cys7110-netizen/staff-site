// ── Supabase ─────────────────────────────────────
const SUPABASE_URL = 'https://zejkbveigebqiiwvosrd.supabase.co';
const SUPABASE_KEY = 'sb_publishable__R1mWzUGZZQKrBT4L_1RhA_UC6vRa6E';
var sb = null;
try {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { headers: { 'X-Client-Info': 'hanji-staff' } }
  });
  console.log('✅ Supabase client created');
} catch(e) {
  console.error('❌ Supabase init failed:', String(e));
}

// ── 啟動時檢查 employees 表，若空則自動寫入預設員工 ──
(async function seedDefaultEmployees(){
  if(!sb) return;
  try {
    var { data, error } = await sb.from('employees').select('id').limit(1);
    if(error) { console.warn('⚠ employees 表查詢失敗:', String(error.message||error)); return; }
    if(data && data.length > 0) {
      console.log('✅ employees 表已有資料，跳過初始化');
      return;
    }
    // 表是空的 → 寫入 A0001~A0100 預設員工
    console.log('📝 employees 表為空，開始寫入預設員工 A0001-A0100...');
    var rows = [];
    for(var i = 1; i <= 100; i++) {
      var num = String(i).padStart(4, '0');
      rows.push({
        emp_no: 'A' + num,
        name: '員工 A' + num,
        emp_type: '正職員工',
        role: 'staff',
        resigned: false,
        password: 'A' + num,
        hourly_rate: 0,
        monthly_salary: 0,
        start_date: '2026-01-01'
      });
    }
    var { error: insertErr } = await sb.from('employees').upsert(rows, { onConflict: 'emp_no' });
    if(insertErr) console.error('❌ 預設員工寫入失敗:', String(insertErr.message||insertErr));
    else console.log('✅ 預設員工 A0001-A0100 已寫入 Supabase');
  } catch(e) { console.error('seedDefaultEmployees error:', String(e)); }
})();

// ── Staff Auth ───────────────────────────────────
var currentStaff = '';
var currentStaffName = '';
var currentStaffId = null;
var currentStaffRole = '';
var _staffLookupTimer = null;

// 登入畫面：輸入員工編號時自動帶出姓名
function lookupStaffName(empNo) {
  var infoEl = document.getElementById('login-staff-info');
  if(!infoEl) return;
  empNo = (empNo||'').trim().toUpperCase();

  if(empNo.length < 2) {
    infoEl.style.display = 'none';
    return;
  }

  // 即時顯示 "查詢中"
  infoEl.style.display = 'block';
  infoEl.style.color = 'var(--text3)';
  infoEl.textContent = '查詢中...';

  clearTimeout(_staffLookupTimer);
  _staffLookupTimer = setTimeout(async function(){

    // 1) 檢查 Supabase 有無初始化
    if(typeof sb === 'undefined' || !sb) {
      infoEl.style.color = 'var(--red)';
      infoEl.textContent = '⚠ 資料庫未連線';
      console.error('[lookupStaffName] sb is undefined');
      return;
    }

    try {
      console.log('[lookupStaffName] querying emp_no =', empNo);

      var res = await sb
        .from('employees')
        .select('emp_no, name, resigned')
        .eq('emp_no', empNo)
        .maybeSingle();  // maybeSingle: 找不到不會報 error

      console.log('[lookupStaffName] result:', JSON.stringify(res));

      if(res.error) {
        infoEl.style.color = 'var(--red)';
        infoEl.textContent = '⚠ 查詢錯誤：' + (res.error.message || '未知');
        console.error('[lookupStaffName] error:', String(res.error.message||res.error));
        return;
      }

      if(!res.data) {
        infoEl.style.color = 'var(--text3)';
        infoEl.textContent = '查無此員工編號';
        return;
      }

      var emp = res.data;
      if(emp.resigned) {
        infoEl.style.color = 'var(--red)';
        infoEl.textContent = emp.emp_no + ' · ' + emp.name + '（已離職）';
        return;
      }

      // ✅ 成功找到員工
      infoEl.style.color = 'var(--accent)';
      infoEl.textContent = emp.emp_no + ' · ' + emp.name;

    } catch(e) {
      console.error('[lookupStaffName] catch error:', String(e));
      infoEl.style.color = 'var(--red)';
      infoEl.textContent = '⚠ 連線失敗：' + (e.message || '請確認網路');
    }
  }, 400);
}

async function doStaffLogin() {
  var user = (document.getElementById('login-user').value||'').trim().toUpperCase();
  var pass = (document.getElementById('login-pass').value||'').trim().toUpperCase();
  if(!user||!pass) { showToast('請輸入帳號與密碼','red'); return; }

  try {
    const { data, error } = await sb
      .from('employees')
      .select('id, emp_no, name, role, resigned')
      .eq('emp_no', user)
      .eq('password', pass)
      .limit(1);

    console.log('Login:', JSON.stringify({data, error, user}));

    if(error) { showToast('登入失敗：' + (error.message||'未知錯誤'),'red'); return; }
    if(!data || data.length === 0) { showToast('帳號或密碼錯誤','red'); return; }

    var emp = data[0];
    if(emp.resigned) { showToast('此員工已離職，無法登入','red'); return; }

    currentStaff = emp.emp_no;
    currentStaffName = emp.name;
    currentStaffId = emp.id;
    currentStaffRole = emp.role;
    try { localStorage.setItem('currentScanStaff', JSON.stringify({id:emp.id, empNo:emp.emp_no, name:emp.name, role:emp.role})); } catch(e){}

    showToast('登入成功 ✅ · ' + currentStaffName,'green');
    setTimeout(function(){
      showScreen('screen-home');
      document.getElementById('home-date').textContent = kstDate({month:'2-digit',day:'2-digit',weekday:'short'});
      var badge = document.getElementById('staff-badge');
      if(badge) badge.textContent = currentStaff + ' · ' + currentStaffName;
    }, 300);
  } catch(e) { console.error(e); showToast('登入失敗','red'); }
}

function doLogout() {
  currentStaff = '';
  currentStaffName = '';
  try { localStorage.removeItem('currentScanStaff'); } catch(e){}
  showScreen('screen-login');
}

// ── Ship List（本地陣列已清空，實際由 renderShiplistFromDB 從 Supabase 讀取）──
const shipOrders = [];

function renderShiplist() {
  var cards = document.getElementById('shiplist-cards');
  if(!cards) return;
  var dateEl = document.getElementById('shiplist-date');
  var cntEl = document.getElementById('shiplist-count');
  if(dateEl) dateEl.textContent = kstDate();
  if(cntEl) cntEl.textContent = shipOrders.length;

  var pending = shipOrders.filter(function(o){ return o.status !== 'done'; });
  var done = shipOrders.filter(function(o){ return o.status === 'done'; });

  cards.innerHTML = '';

  // Pending orders
  if(pending.length) {
    var hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:12px;letter-spacing:1px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-bottom:8px';
    hdr.textContent = '待包裝 · ' + pending.length + ' 筆';
    cards.appendChild(hdr);
  }

  // Sort: pending first, done last
  var sorted = shipOrders.slice().sort(function(a,b){ return a.status==='done'?1:-1; });
  sorted.forEach(function(o, idx) {
    var card = document.createElement('div');
    var isDone = o.status === 'done';
    card.style.cssText = 'background:var(--card);border:1.5px solid '+(isDone?'var(--green)':'var(--border)')+';border-radius:14px;overflow:hidden;margin-bottom:12px;opacity:'+(isDone?'0.7':'1');

    // Method badge color
    var methodColor = o.method.includes('海運') ? '#0a7a52' : o.method.includes('直飛') ? '#1B4F8A' : '#6B3E9A';
    var methodBg = o.method.includes('海運') ? 'rgba(14,130,90,0.1)' : o.method.includes('直飛') ? 'rgba(27,79,138,0.1)' : 'rgba(107,62,154,0.1)';

    card.innerHTML =
      // Header
      '<div style="padding:12px 16px;background:'+(isDone?'rgba(40,180,100,0.08)':'var(--bg)')+';border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
      + '<div>'
      + '<div style="font-size:15px;font-weight:800;color:'+(isDone?'var(--green)':'var(--text)')+'">'+o.member+' · '+o.name+'</div>'
      + '<div style="font-size:12px;color:var(--text3);margin-top:2px">'+o.phone+' · '+o.id+'</div>'
      + '</div>'
      + '<span style="background:'+(isDone?'var(--green-bg)':methodBg)+';color:'+(isDone?'var(--green)':methodColor)+';font-size:12px;padding:4px 12px;border-radius:20px;font-weight:700">'+(isDone?'✅ 已完成':o.method)+'</span>'
      + '</div>'
      // Body
      + '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px;font-size:13px">'
      // Info rows
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      + '<div style="background:var(--bg);border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--accent)">'+o.count+'</div><div style="font-size:11px;color:var(--text3)">件數</div></div>'
      + '<div style="background:'+methodBg+';border-radius:8px;padding:10px;text-align:center"><div style="font-size:13px;font-weight:700;color:'+methodColor+'">'+o.pack+'</div><div style="font-size:11px;color:var(--text3);margin-top:2px">包裝需求</div></div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;align-items:center">'
      + '<span style="color:var(--text3);flex-shrink:0">📦 內容物</span>'
      + '<span style="font-weight:500;color:'+(o.content.includes('電池')||o.content.includes('藍芽')?'var(--red)':'var(--text)')+'">'+o.content+'</span>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:4px">'
      + '<span style="color:var(--text3);font-size:12px">📍 收件地址</span>'
      + '<span style="line-height:1.6">'+o.addr+'</span>'
      + '</div>'
      + (o.note ? '<div style="background:rgba(220,60,60,0.05);border-left:3px solid rgba(200,50,50,0.3);padding:8px 12px;border-radius:0 6px 6px 0;font-size:13px;color:var(--text2)">📋 '+o.note+'</div>' : '')
      + (isDone && o.packPhoto ? '<div><img src="'+o.packPhoto+'" style="width:100%;border-radius:8px;max-height:180px;object-fit:cover"></div>' : '')
      + '<div id="ship-btns-'+idx+'" style="display:flex;gap:8px;margin-top:4px"></div>'
      + '</div>';

    cards.appendChild(card);

    var btnDiv = card.querySelector('#ship-btns-'+idx);
    if(!isDone) {
      var packBtn = document.createElement('button');
      packBtn.textContent = '📸 包裝完成';
      packBtn.style.cssText = 'flex:1;background:var(--accent);border:none;color:white;font-size:14px;font-weight:700;padding:13px;border-radius:10px;cursor:pointer';
      (function(orderNo){ packBtn.addEventListener('click', function(){ openPackDoneByNo(orderNo); }); })(o.no);
      btnDiv.appendChild(packBtn);
    } else {
      var viewBtn = document.createElement('button');
      viewBtn.textContent = '查看照片';
      viewBtn.style.cssText = 'flex:1;background:var(--bg);border:1px solid var(--border);color:var(--text2);font-size:13px;padding:11px;border-radius:10px;cursor:pointer';
      (function(photo){ viewBtn.addEventListener('click', function(){
        if(photo) { showPhotoViewer(photo); } else { showToast('尚無照片'); }
      }); })(o.packPhoto);
      btnDiv.appendChild(viewBtn);
    }
  });

  // Done section header (appended after all cards)
  if(done.length) {
    var doneHdr = document.createElement('div');
    doneHdr.style.cssText = 'font-size:12px;letter-spacing:1px;color:var(--green);text-transform:uppercase;font-weight:600;margin-top:8px;margin-bottom:8px';
    doneHdr.textContent = '✅ 已完成 · ' + done.length + ' 筆';
    cards.appendChild(doneHdr);
  }
}

// ── Pack Done Modal ───────────────────────────────
function openPackDoneByNo(no) {
  var orderIdx = shipOrders.findIndex(function(o){ return o.no === no; });
  if(orderIdx === -1) return;
  openPackDone(orderIdx);
}

function openPackDone(orderIdx) {
  var order = shipOrders[orderIdx];
  if(!order) return;
  currentPackIdx = orderIdx;
  var modal = document.getElementById('pack-modal');
  var title = document.getElementById('pack-modal-title');
  if(title) title.textContent = order.member + ' · ' + order.name + ' (' + order.count + ' 件)';
  document.getElementById('pack-photo-preview').innerHTML = '';
  packPhoto = null;
  if(modal) modal.classList.add('open');
}

var currentPackIdx = -1;
var packPhoto = null;

function handlePackPhoto(input) {
  var file = input.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    packPhoto = e.target.result;
    var preview = document.getElementById('pack-photo-preview');
    preview.innerHTML = '<img src="'+packPhoto+'" style="width:100%;border-radius:10px;max-height:200px;object-fit:cover;margin-top:8px">';
  };
  reader.readAsDataURL(file);
}

function confirmPackDone() {
  if(!packPhoto) { showToast('請先拍照上傳包裝照片', 'red'); return; }
  var order = shipOrders[currentPackIdx];
  if(!order) return;
  order.status = 'done';
  order.packPhoto = packPhoto;
  order.packedBy = currentStaff;
  order.packedTime = kstTime({hour:'2-digit',minute:'2-digit'});
  document.getElementById('pack-modal').classList.remove('open');
  showToast('✅ ' + order.member + ' 包裝完成 · ' + currentStaff, 'green');
  renderShiplist();
}

function showPhotoViewer(src) {
  var v = document.getElementById('photo-viewer');
  var img = document.getElementById('photo-viewer-img');
  if(img) img.src = src;
  if(v) v.classList.add('open');
}
function exportShiplist() {
  showToast('出貨單已匯出 ✅','green');
}

// ── Query: 使用下方的 runStaffQueryDB（Supabase 版）──

// ── Point / Pickup List（本地陣列已清空，實際由 renderPointlistFromDB 從 Supabase 讀取）──
const pointRequests = [];

function renderPointlist() {
  var cards = document.getElementById('pointlist-cards');
  if(!cards) return;
  if(!pointRequests.length) {
    cards.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);font-size:14px">目前無待確認申請</div>';
    return;
  }
  cards.innerHTML = '';
  pointRequests.forEach(function(r) {
    var isPoint = r.type === 'point';
    var card = document.createElement('div');
    card.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:8px';
    var pkgRows = r.pkgs.map(function(t){
      return '<div style="font-family:monospace;font-size:12px;color:var(--text2);background:var(--bg);padding:6px 10px;border-radius:6px;margin-bottom:4px">'+t+'</div>';
    }).join('');
    // Get shelf info for each pkg
    var pkgDetails = r.pkgs.map(function(t){
      var pkg = packageDB[t] || {};
      return '<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:6px">'
        + '<div style="font-family:monospace;font-size:12px;color:var(--accent);margin-bottom:4px">'+t+'</div>'
        + '<div style="display:flex;gap:14px;font-size:13px">'
        + '<span style="color:var(--text2)">📍 <strong>'+(pkg.shelf||'未指定')+'</strong></span>'
        + '<span style="color:var(--text3)">'+(pkg.weight||'—')+' kg</span>'
        + '</div></div>';
    }).join('');

    card.innerHTML = '<div style="padding:12px 16px;background:'+(isPoint?'rgba(27,79,138,0.08)':'rgba(40,180,100,0.08)')+';border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
      + '<div>'
      + '<div style="font-size:16px;font-weight:800;color:'+(isPoint?'var(--accent)':'var(--green)')+'">'+r.member+'</div>'
      + '<div style="font-size:13px;color:var(--text2);margin-top:1px">'+r.name+' · '+(isPoint?'🔍 點貨':'🏪 自取')+'</div>'
      + '</div>'
      + '<div style="text-align:right">'
      + '<div style="font-size:24px;font-weight:800;color:'+(isPoint?'var(--accent)':'var(--green)')+'">'+r.pkgs.length+'</div>'
      + '<div style="font-size:11px;color:var(--text3)">申請件數</div>'
      + '</div>'
      + '</div>'
      + '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:4px;font-size:13px">'
      + pkgDetails
      + (r.note ? '<div style="color:var(--text2);font-size:12px;padding:6px 0">備註：'+r.note+'</div>' : '')
      + '<div style="display:flex;gap:8px;margin-top:6px" id="btns-'+r.id+'"></div>'
      + '</div>';
    cards.appendChild(card);
    // Add buttons via JS to avoid quote issues
    var btnDiv = card.querySelector('#btns-'+r.id);
    var doneBtn = document.createElement('button');
    doneBtn.textContent = '✅ 完成';
    doneBtn.style.cssText = 'flex:1;background:var(--green);border:none;color:white;font-size:14px;font-weight:700;padding:12px;border-radius:8px;cursor:pointer';
    doneBtn.addEventListener('click', function(){ completeRequest(r.id, 'done'); });
    var deferBtn = document.createElement('button');
    deferBtn.textContent = '暫緩';
    deferBtn.style.cssText = 'flex:1;background:var(--bg);border:1px solid var(--border);color:var(--text2);font-size:14px;padding:12px;border-radius:8px;cursor:pointer';
    deferBtn.addEventListener('click', function(){ completeRequest(r.id, 'defer'); });
    btnDiv.appendChild(doneBtn);
    btnDiv.appendChild(deferBtn);
  });
}
function completeRequest(id, action) {
  if(action === 'done') {
    r.completedBy = currentStaff;
    r.completedTime = kstTime({hour:'2-digit',minute:'2-digit'});
    showToast('已完成 · ' + currentStaff + ' ✅','green');
  } else {
    showToast('已暫緩處理 · ' + currentStaff);
  }
  // Remove from list
  const idx = pointRequests.findIndex(function(r){ return r.id===id; });
  if(idx > -1) pointRequests.splice(idx,1);
  renderPointlist();
}

// ── Unclaimed Packages ───────────────────────────
var unclaimedPkgs = [];

async function renderUnclaimed() {
  var cards = document.getElementById('unclaimed-cards');
  var cnt = document.getElementById('unclaimed-count');
  if(!cards) return;

  // Load from Supabase
  if(sb) {
    try {
      const { data, error } = await sb
        .from('packages')
        .select('*')
        .eq('status', 'unclaimed')
        .order('created_at', { ascending: false });
      if(!error && data) {
        unclaimedPkgs = data.map(function(p){
          return {
            id: p.id,
            trackNo: p.tracking_no || '不明',
            date: p.created_at ? kstDateStr(p.created_at,{month:'2-digit',day:'2-digit'}) : '—',
            weight: p.weight_kg || 0,
            shelf: p.shelf || '—',
            photos: p.photo_urls || [],
            note: p.note || '',
            processedBy: p.processed_by_name || '',
            dbId: p.id
          };
        });
      }
    } catch(e) { console.error('Load unclaimed error:', e); }
  }

  if(cnt) cnt.textContent = unclaimedPkgs.length;
  if(!unclaimedPkgs.length) {
    cards.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);font-size:14px">目前無無人包裹</div>';
    return;
  }
  cards.innerHTML = '';
  unclaimedPkgs.forEach(function(p, i) {
    var card = document.createElement('div');
    card.style.cssText = 'background:var(--card);border:1.5px solid rgba(220,60,60,0.2);border-radius:12px;overflow:hidden;margin-bottom:10px';
    // 照片縮圖
    var photoHtml = '';
    if(p.photos && p.photos.length > 0) {
      photoHtml = '<div style="display:flex;gap:6px;margin-top:6px">';
      p.photos.forEach(function(url, i){ photoHtml += '<img src="'+url+'" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer" onclick="viewPhoto(\''+url+'\')">'; });
      photoHtml += '</div>';
    }
    card.innerHTML = '<div style="padding:12px 16px;background:rgba(220,60,60,0.05);border-bottom:1px solid rgba(220,60,60,0.12);display:flex;justify-content:space-between;align-items:center">'
      + '<div>'
      + '<div style="font-family:monospace;font-size:14px;font-weight:700;color:var(--red)">' + p.trackNo + '</div>'
      + '<div style="font-size:12px;color:var(--text3);margin-top:3px">到貨：' + p.date + ' · ' + p.weight + 'kg · 📍' + p.shelf + '</div>'
      + (p.processedBy ? '<div style="font-size:11px;color:var(--text3);margin-top:2px">入庫員工：' + p.processedBy + '</div>' : '')
      + '</div>'
      + '<span style="background:rgba(220,60,60,0.1);color:var(--red);font-size:11px;padding:3px 10px;border-radius:20px;font-weight:600">待認領</span>'
      + '</div>'
      + '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">'
      + (p.note ? '<div style="font-size:13px;color:var(--text2)">備註：' + p.note + '</div>' : '')
      + photoHtml
      + '<div style="display:flex;gap:8px;align-items:center">'
      + '<input id="claim-input-' + p.id + '" type="text" placeholder="輸入會員代號（5碼數字）" style="flex:1;background:var(--bg);border:1.5px solid var(--border);color:var(--text);font-size:14px;padding:10px 12px;border-radius:8px;outline:none;text-transform:uppercase" autocapitalize="characters" inputmode="numeric" maxlength="5" oninput="this.value=this.value.replace(/[^0-9]/g,\'\');lookupClaimMember(this.value,\'' + p.id + '\')">'
      + '</div>'
      + '<div id="claim-member-info-' + p.id + '" style="font-size:12px;color:var(--accent);display:none;padding:4px 8px;background:rgba(27,79,138,0.05);border-radius:6px"></div>'
      + '<div style="display:flex;gap:8px" id="ubtn-' + p.id + '"></div>'
      + '</div>';
    cards.appendChild(card);

    var btnDiv = card.querySelector('#ubtn-' + p.id);
    var claimBtn = document.createElement('button');
    claimBtn.textContent = '認領送出';
    claimBtn.style.cssText = 'flex:1;background:var(--accent);border:none;color:white;font-size:13px;font-weight:700;padding:11px;border-radius:8px;cursor:pointer';
    claimBtn.addEventListener('click', function(){
      var memberInput = document.getElementById('claim-input-' + p.id);
      var digits = memberInput ? memberInput.value.trim().replace(/[^0-9]/g,'') : '';
      if(!digits || digits.length < 3) { showToast('請輸入會員數字代號（至少3碼）','red'); return; }
      claimUnclaimedPackage(p, digits);
    });

    var editBtn = document.createElement('button');
    editBtn.textContent = '備註';
    editBtn.style.cssText = 'flex:1;background:var(--bg);border:1px solid var(--border);color:var(--text2);font-size:13px;padding:11px;border-radius:8px;cursor:pointer';
    editBtn.addEventListener('click', function(){
      var note = prompt('更新備註：', p.note);
      if(note !== null) {
        p.note = note;
        if(sb && p.dbId) {
          sb.from('packages').update({note:note}).eq('id', p.dbId).then(function(){});
        }
        renderUnclaimed();
      }
    });

    btnDiv.appendChild(claimBtn);
    btnDiv.appendChild(editBtn);
  });
}

// 輸入會員代號時自動查詢客人資料 + 貨架 + 在庫數
var _claimLookupTimer = null;
function lookupClaimMember(val, pkgId) {
  clearTimeout(_claimLookupTimer);
  var info = document.getElementById('claim-member-info-' + pkgId);
  if(!info) return;
  val = (val||'').trim().toUpperCase();
  if(val.length < 3) { info.style.display = 'none'; return; }
  _claimLookupTimer = setTimeout(async function(){
    if(!sb) return;
    try {
      var { data } = await sb.from('members').select('member_code,name,phone').eq('member_code', val).limit(1);
      if(data && data.length > 0) {
        var m = data[0];
        // 查詢該會員在庫包裹數 + 貨架位置
        var { data: pkgs } = await sb.from('packages').select('tracking_no,shelf,status').eq('member_code', val);
        var _doneS = ['delivered','picked','transit','shipping'];
        var arrived = (pkgs||[]).filter(function(p){ return !_doneS.includes(p.status); });
        var shelfList = arrived.map(function(p){ return p.shelf; }).filter(function(s){ return s && s !== '—'; });
        var mainShelf = shelfList.length > 0 ? shelfList[0] : '—';
        info.innerHTML = '👤 <strong>' + m.member_code + '</strong> · ' + (m.name||'—')
          + '<br>📍 貨架：<strong>' + mainShelf + '</strong> · 📦 認領前：<strong>' + arrived.length + ' 件</strong>'
          + ' · 認領後：<strong>' + (arrived.length + 1) + ' 件</strong>';
        info.style.display = 'block';
        info.style.color = 'var(--accent)';
        // 存貨架位置供認領時使用
        info.dataset.shelf = mainShelf !== '—' ? mainShelf : '';
        info.dataset.valid = 'true'; // ★ 標記為有效
      } else {
        // ★ 防呆：查無此代號 → 不允許認領
        info.innerHTML = '❌ 查無會員代號「' + val + '」<br><span style="font-size:12px">此代號不存在，無法認領。請確認後重新輸入。</span>';
        info.style.display = 'block';
        info.style.color = 'var(--red)';
        info.dataset.shelf = '';
        info.dataset.valid = 'false'; // 標記為無效
      }
    } catch(e){}
  }, 400);
}

async function claimUnclaimedPackage(pkg, memberCode) {
  if(!sb) { showToast('資料庫未連線','red'); return; }

  // ★ 防呆：先驗證代號是否存在於 members 表
  var info = document.getElementById('claim-member-info-' + pkg.id);
  if(info && info.dataset.valid === 'false') {
    alert('❌ 會員代號「' + memberCode + '」不存在！\n\n無法認領，請先確認代號是否正確。');
    return;
  }

  try {
    // 查詢會員資料 + 貨架位置
    var memberName = '';
    var autoShelf = '';
    try {
      var { data: memberData } = await sb.from('members').select('name').eq('member_code', memberCode).limit(1);
      if(!memberData || memberData.length === 0) {
        // ★ 再次驗證（以防 info element 不存在的情況）
        alert('❌ 會員代號「' + memberCode + '」不存在！\n\n無法認領。');
        return;
      }
      memberName = memberData[0].name || '';
    } catch(e){}
    // 取得該會員的貨架位置（從已有包裹）
    var info = document.getElementById('claim-member-info-' + pkg.id);
    if(info && info.dataset.shelf) {
      autoShelf = info.dataset.shelf;
    } else {
      try {
        var { data: shelfPkgs } = await sb.from('packages').select('shelf').eq('member_code', memberCode).in('status',['arrived','checking','pointed','point_done','carried','wait_pickup','unclaimed']).limit(1);
        if(shelfPkgs && shelfPkgs.length > 0 && shelfPkgs[0].shelf) autoShelf = shelfPkgs[0].shelf;
      } catch(e){}
    }

    var updateData = {
      member_code: memberCode,
      status: 'arrived',
      scanned_at: new Date().toISOString(),
      note: (pkg.note ? pkg.note + ' | ' : '') + '無人包裹認領（' + currentStaffName + '）',
      processed_by: currentStaffId,
      processed_by_name: currentStaffName
    };
    // 自動歸位到客戶貨架
    if(autoShelf) updateData.shelf = autoShelf;

    const { error: updateErr } = await sb.from('packages').update(updateData).eq('id', pkg.dbId);
    if(updateErr) { showToast('認領失敗：' + updateErr.message, 'red'); return; }

    var displayName = memberName ? memberCode + '（' + memberName + '）' : memberCode;
    var shelfMsg = autoShelf ? ' · 📍歸位 ' + autoShelf : '';
    showToast('✅ 已歸入 ' + displayName + ' 的包裹清單' + shelfMsg, 'green');
    renderUnclaimed();
    loadDailyStats(); // 更新首頁統計
  } catch(e) { console.error(e); showToast('認領失敗','red'); }
}

function addUnclaimedManual() {
  var track = prompt('輸入追蹤單號（若不明請輸入「不明」）：');
  if(!track) return;
  var note = prompt('備註（例：無代號、破箱）：') || '';
  if(sb) {
    sb.from('packages').insert({
      tracking_no: track.trim().toUpperCase(),
      status: 'unclaimed',
      note: note,
      processed_by: currentStaffId,
      processed_by_name: currentStaffName
    }).then(function(res){
      if(res.error) { showToast('新增失敗','red'); return; }
      showToast('已新增無人包裹（' + currentStaffName + '）','green');
      renderUnclaimed();
    });
  } else {
    unclaimedPkgs.push({id:'U'+Date.now(), trackNo:track, date:kstDate({month:'2-digit',day:'2-digit'}), note:note});
    showToast('已新增無人包裹','green');
    renderUnclaimed();
  }
}

// ── Override showScreen to render data on navigate ─
var origShowScreen = showScreen;
function showScreen(id) {
  // 離開掃碼頁面時自動停止相機
  if(id !== 'screen-scan' && id !== 'screen-detail' && id !== 'screen-success') {
    stopCamera();
  }
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  var el = document.getElementById(id);
  if(el) el.classList.add('active');
  if(id === 'screen-scan') {
    // ★ 先完整停止相機（清除殘留狀態），再延遲自動啟動
    stopCamera();
    setTimeout(function(){ startCamera(); }, 500);
  }
  if(id === 'screen-shiplist') renderShiplistFromDB();
  if(id === 'screen-pointlist') renderPointlistFromDB();
  if(id === 'screen-unclaimed') renderUnclaimed();
  if(id === 'screen-tasks') loadTasks();
  if(id === 'screen-query') loadRecentPackagesDB();
  if(id === 'screen-customer') { document.getElementById('customer-search-input').value=''; document.getElementById('customer-result').innerHTML='<div style="text-align:center;padding:40px;color:var(--text3)">輸入會員代號搜尋</div>'; }
  if(id === 'screen-home') {
    loadDailyStats();
  }
}

// loadUnclaimedBadge 已整合進 loadDailyStats

// ── Data（Supabase 連動，無需本地 Demo）──
const members = {};

// Package DB（掃碼後自動建立，無需 Demo）
const packageDB = {};

let currentPkg = null;
let todayCount = 0;
let recentScans = JSON.parse(sessionStorage.getItem('recentScans')||'[]');
let uploadedPhotos = [];
let btDevice = null;
let btConnected = false;
let batchMode = false;
let batchCount = 0;

// ── 連續掃碼模式 ─────────────────────────────────
let continuousMode = false;
let continuousMemberCode = null;
let continuousMemberName = null;
let continuousCount = 0;

function toggleContinuousMode() {
  continuousMode = !continuousMode;
  var toggle = document.getElementById('continuous-toggle');
  var countEl = document.getElementById('continuous-count');
  var memberBar = document.getElementById('continuous-member-bar');
  if(continuousMode) {
    toggle.classList.add('batch-on');
    countEl.style.display = '';
    continuousCount = 0;
    countEl.textContent = '連續 0 件';
    // 如果目前已有會員代號，自動鎖定
    var mci = document.getElementById('member-code-input');
    var currentCode = mci ? mci.value.trim().toUpperCase() : '';
    if(currentCode && members[currentCode]) {
      continuousMemberCode = currentCode;
      continuousMemberName = members[currentCode].name;
      updateContinuousBar();
    }
    showToast('🔁 連續掃碼已開啟 — 請先確認代號', 'green');
  } else {
    toggle.classList.remove('batch-on');
    countEl.style.display = 'none';
    continuousMemberCode = null;
    continuousMemberName = null;
    if(memberBar) memberBar.style.display = 'none';
    showToast('連續掃碼已關閉');
  }
}

function updateContinuousBar() {
  var bar = document.getElementById('continuous-member-bar');
  var display = document.getElementById('continuous-member-display');
  if(!bar) return;
  if(continuousMode && continuousMemberCode) {
    bar.style.display = 'block';
    display.textContent = continuousMemberCode + (continuousMemberName ? '（' + continuousMemberName + '）' : '');
  } else {
    bar.style.display = 'none';
  }
}

function clearContinuousMember() {
  continuousMemberCode = null;
  continuousMemberName = null;
  updateContinuousBar();
  showToast('已解除鎖定代號');
}

function toggleBatchMode() {
  batchMode = !batchMode;
  var toggle = document.getElementById('batch-toggle');
  var countEl = document.getElementById('batch-count');
  if(batchMode) {
    toggle.classList.add('batch-on');
    countEl.style.display = '';
    batchCount = 0;
    countEl.textContent = '本批 0 件';
    showToast('⚡ 批量模式已開啟', 'green');
  } else {
    toggle.classList.remove('batch-on');
    countEl.style.display = 'none';
    showToast('批量模式已關閉');
  }
}

function showBatchSuccess(trackNo, weight) {
  var banner = document.getElementById('batch-success-banner');
  var text = document.getElementById('batch-success-text');
  if(!banner) return;
  text.textContent = '✅ ' + trackNo + '  ' + weight + 'kg  已入庫！';
  banner.style.display = 'block';
  setTimeout(function(){ banner.style.display = 'none'; }, 2000);
}

// ── Init ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  document.getElementById('scan-date').textContent = kstDate({month:'2-digit',day:'2-digit',weekday:'short'});
  updateTodayCount();
  renderRecent();

  // ── 頁面重整後自動恢復登入狀態 ──
  try {
    var savedStaff = JSON.parse(localStorage.getItem('currentScanStaff') || '{}');
    if(savedStaff && savedStaff.empNo && savedStaff.name) {
      console.log('🔄 恢復員工登入：', savedStaff.empNo, savedStaff.name);
      currentStaff = savedStaff.empNo;
      currentStaffName = savedStaff.name;
      currentStaffId = savedStaff.id || null;
      currentStaffRole = savedStaff.role || '';
      // 更新 UI
      var badge = document.getElementById('staff-badge');
      if(badge) badge.textContent = currentStaff + ' · ' + currentStaffName;
      showScreen('screen-home');
    }
  } catch(e){ console.error('auto-restore staff login:', e); }
});

// ── 即時同步機制 ─────────────────────────────────
// 1) Supabase Realtime：包裹或任務有任何變動 → 立即刷新統計
function setupRealtimeSync() {
  if(!sb || !sb.channel) { console.warn('⏭️ Realtime 不可用，僅用輪詢'); return; }
  try {
    sb.channel('staff-live-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' }, function(payload) {
        console.log('🔔 packages 變動:', payload.eventType);
        refreshAllStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, function(payload) {
        console.log('🔔 tasks 變動:', payload.eventType);
        refreshAllStats();
      })
      .subscribe(function(status) {
        console.log('📡 Realtime 狀態:', status);
      });
  } catch(e) { console.error('Realtime setup error:', e); }
}

// 統一刷新所有統計（防抖：500ms 內多次觸發只執行一次）
var _refreshTimer = null;
function refreshAllStats() {
  if(_refreshTimer) clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(async function() {
    await updateTodayCount();
    await loadDailyStats();
  }, 500);
}

// 2) 輪詢 fallback：每 10 秒自動刷新（確保數字即時更新）
var _lastKSTDate = '';
setInterval(function() {
  if(!sb) return;
  // 檢查是否跨日（KST）
  var range = getKSTTodayRange();
  var todayStr = range.start.slice(0, 10);
  if(_lastKSTDate && _lastKSTDate !== todayStr) {
    console.log('🌅 偵測到跨日！自動歸零');
    document.getElementById('scan-date').textContent = kstDate({month:'2-digit',day:'2-digit',weekday:'short'});
  }
  _lastKSTDate = todayStr;
  refreshAllStats();
}, 10000);

// 3) 頁面重新可見時立即刷新（從其他 App 切回來）
document.addEventListener('visibilitychange', function() {
  if(!document.hidden && sb) {
    console.log('👀 頁面重新可見，立即刷新統計');
    refreshAllStats();
  }
});

// 3) 啟動 Realtime（等 Supabase 初始化完成後）
setTimeout(function() {
  if(sb) {
    setupRealtimeSync();
    loadDailyStats();
  }
}, 3000);

// ── Screen nav ────────────────────────────────────

function goBack() {
  showScreen('screen-home');
  document.getElementById('manual-barcode').value = '';
}

function scanNext() {
  currentPkg = null;
  uploadedPhotos = [];
  document.getElementById('photo-grid').innerHTML = '<div class="photo-add" onclick="document.getElementById(\'photo-input\').click()">＋</div>';
  // Reset shelf
  document.getElementById('shelf-letter').value = '';
  document.getElementById('shelf-manual').value = '';
  document.getElementById('shelf-result').textContent = '—';
  const posSelect = document.getElementById('shelf-pos-select');
  if(posSelect) posSelect.value = '上';
  shelfPos = '上';
  document.getElementById('weight-input').value = '';
  document.getElementById('weight-display').textContent = '0.00';
  document.getElementById('inbound-note').value = '';
  var unc = document.getElementById('is-unclaimed');
  if(unc) { unc.checked = false; }
  var mci = document.getElementById('member-code-input');
  // ★ 連續掃碼模式：保留鎖定的代號
  if(continuousMode && continuousMemberCode) {
    if(mci) mci.value = continuousMemberCode;
  } else {
    if(mci) mci.value = '';
  }
  showScreen('screen-scan');
  setTimeout(function(){ startCamera(); }, 300);
}

// ── Toast ─────────────────────────────────────────
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' '+type : '');
  setTimeout(function(){ t.classList.remove('show'); }, 2500);
}

// ── Counter（從 Supabase 即時讀取，非本地假資料）──
async function updateTodayCount() {
  if(!sb) return;
  try {
    var range = getKSTTodayRange();
    // ★ 用 select('*') 搭配 count: 'exact', head: true 取得計數
    var { count: c1, error: e1 } = await sb.from('packages')
      .select('*', { count: 'exact', head: true })
      .gte('scanned_at', range.start)
      .lt('scanned_at', range.end);

    var finalCount = 0;
    if(!e1 && typeof c1 === 'number') {
      finalCount = c1;
    } else {
      // fallback：用 created_at 查
      console.warn('scanned_at 查詢失敗，fallback 用 created_at:', e1 ? e1.message : '');
      var { count: c2, error: e2 } = await sb.from('packages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', range.start)
        .lt('created_at', range.end);
      if(!e2 && typeof c2 === 'number') {
        finalCount = c2;
      }
    }

    todayCount = finalCount;
    console.log('📊 todayCount=' + todayCount + ' (range=' + range.start + '~' + range.end + ')');
  } catch(e) { console.error('updateTodayCount error:', e); }

  // ★ 統一更新所有「今日入庫」相關 UI 元素
  var txt = '今日 ' + todayCount + ' 件';
  var el1 = document.getElementById('today-count');
  var el2 = document.getElementById('success-count');
  var el3 = document.getElementById('stat-inbound');
  if(el1) el1.textContent = txt;
  if(el2) el2.textContent = txt;
  if(el3) el3.textContent = todayCount;
}

// ── Camera ────────────────────────────────────────
let html5QrScanner = null;

// 掃碼成功時自動截圖存為入庫照片
function captureFrameAsPhoto() {
  try {
    // html5-qrcode 內部管理 video，嘗試取得畫面截圖
    var video = document.querySelector('#html5-qrcode-reader video');
    if(!video || !video.videoWidth) return;
    var c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    uploadedPhotos.push(c.toDataURL('image/jpeg', 0.8));
    console.log('📸 自動截圖已存為入庫照片');
  } catch(e) { console.error('captureFrameAsPhoto error:', e); }
}

function startCamera() {
  var placeholder = document.getElementById('scan-placeholder-div');
  var viewfinder = document.getElementById('scan-viewfinder-div');

  // ★ 如果相機已在運行，只確保 viewfinder 可見
  if(html5QrScanner) {
    if(placeholder) placeholder.style.display = 'none';
    if(viewfinder) viewfinder.style.display = 'block';
    return;
  }

  if(typeof Html5Qrcode === 'undefined') {
    showToast('掃碼引擎載入失敗，請手動輸入單號', 'red');
    return;
  }

  placeholder.style.display = 'none';
  viewfinder.style.display = 'block';

  // 不指定格式 → 掃描所有條碼/QR碼格式；啟用原生 BarcodeDetector API
  html5QrScanner = new Html5Qrcode('html5-qrcode-reader', {
    useBarCodeDetectorIfSupported: true,
    verbose: false
  });

  // 自適應掃描框（螢幕 80%）
  var screenW = window.innerWidth || 360;
  var boxW = Math.min(Math.floor(screenW * 0.8), 350);
  var boxH = Math.floor(boxW * 0.5);

  html5QrScanner.start(
    { facingMode: 'environment' },
    { fps: 15, qrbox: { width: boxW, height: boxH } },
    function onScanSuccess(decodedText, decodedResult) {
      console.log('✅ decoded:', decodedText);
      captureFrameAsPhoto();
      stopCamera();
      lookupBarcode(decodedText);
    },
    function onScanFailure() {}
  ).catch(function(err) {
    console.error('Camera error:', err);
    showToast('無法開啟相機：' + (err.message||err), 'red');
    placeholder.style.display = 'flex';
    viewfinder.style.display = 'none';
    html5QrScanner = null;
  });
}

function stopCamera() {
  if(html5QrScanner) {
    html5QrScanner.stop().then(function(){
      html5QrScanner.clear();
      html5QrScanner = null;
      console.log('📷 Camera stopped');
    }).catch(function(err){
      console.warn('stopCamera warn:', err);
      html5QrScanner = null;
    });
  }
  document.getElementById('scan-placeholder-div').style.display = 'flex';
  document.getElementById('scan-viewfinder-div').style.display = 'none';
}

// ── Member Code Lookup ───────────────────────────
// ★ 防抖計時器
var _memberLookupTimer = null;

// ★ 打字中觸發（oninput）：靜默查詢，不跳 alert，等打滿 5 碼才查
function lookupMemberCode(code) {
  clearTimeout(_memberLookupTimer);
  if(!code || code.trim().length < 5) return; // 不到 5 碼不查
  // 延遲 400ms 等使用者打完再查（防抖）
  _memberLookupTimer = setTimeout(function(){
    _doMemberLookup(code.trim().toUpperCase(), false);
  }, 400);
}

// ★ 按「確認」按鈕觸發：立即查詢 + 查無會跳警告
function confirmMemberCode() {
  clearTimeout(_memberLookupTimer);
  var input = document.getElementById('member-code-input');
  var code = input ? input.value.trim().toUpperCase() : '';
  if(!code) { showToast('請輸入會員代號'); return; }
  _doMemberLookup(code, true); // true = 查無時跳警告
}

// ★ 核心查詢邏輯（showAlert: 是否在查無時跳 alert）
async function _doMemberLookup(code, showAlert) {
  var name = document.getElementById('member-name');
  var email = document.getElementById('member-email');
  var input = document.getElementById('member-code-input');
  var isUnclaimed = document.getElementById('is-unclaimed');

  var codesToTry = [code];

  // === 1) 先查本地快取 ===
  for(var i = 0; i < codesToTry.length; i++) {
    var member = members[codesToTry[i]];
    if(member) {
      var matchedCode = codesToTry[i];
      if(name) name.textContent = member.name;
      if(email) email.textContent = member.email;
      if(isUnclaimed) isUnclaimed.checked = false;
      if(currentPkg) currentPkg.memberCode = matchedCode;
      if(input) input.value = matchedCode;
      showToast('✅ 找到會員：'+member.name, 'green');
      // ★ 連續掃碼：鎖定代號
      if(continuousMode) {
        continuousMemberCode = matchedCode;
        continuousMemberName = member.name;
        updateContinuousBar();
      }
      autoFillShelfFromExisting(matchedCode);
      return;
    }
  }

  // === 2) 查 Supabase ===
  if(sb) {
    try {
      var { data: rows, error } = await sb
        .from('members')
        .select('*')
        .in('member_code', codesToTry);

      if(!error && rows && rows.length > 0) {
        var sbMember = rows[0];
        var matchedCode = sbMember.member_code;
        members[matchedCode] = {
          name: sbMember.name || matchedCode,
          email: sbMember.email || '',
          phone: sbMember.phone || ''
        };
        if(name) name.textContent = sbMember.name || matchedCode;
        if(email) email.textContent = sbMember.email || '';
        if(isUnclaimed) isUnclaimed.checked = false;
        if(currentPkg) currentPkg.memberCode = matchedCode;
        if(input) input.value = matchedCode;
        showToast('✅ 找到會員：'+(sbMember.name || matchedCode), 'green');
        // ★ 連續掃碼：鎖定代號
        if(continuousMode) {
          continuousMemberCode = matchedCode;
          continuousMemberName = sbMember.name || matchedCode;
          updateContinuousBar();
        }
        autoFillShelfFromExisting(matchedCode);
        return;
      }
    } catch(e) { console.error('Supabase member lookup error:', e); }

    // === 3) 查無此代號 ===
    if(name) name.textContent = '⚠️ 查無此會員';
    if(email) email.textContent = code;

    // ★ 只有按「確認」才跳 alert + 自動標無人包裹
    if(showAlert) {
      if(isUnclaimed) isUnclaimed.checked = true;
      if(currentPkg) currentPkg.memberCode = null;
      toggleUnclaimed(true);
      alert('⚠️ 查無會員代號：' + code + '\n\n已自動標記為「無人包裹」。\n\n如果代號輸入正確，請聯繫管理員新增此會員。');
    }
  }
}

// ★ 自動從該客人在庫包裹帶入貨架位置
async function autoFillShelfFromExisting(memberCode) {
  if(!sb || !memberCode) return;
  try {
    var { data: pkgs } = await sb.from('packages').select('shelf,status')
      .eq('member_code', memberCode)
      .in('status', ['arrived','checking','pointed','point_done','carried','wait_pickup','unclaimed'])
      .order('created_at', { ascending: false })
      .limit(50);
    if(!pkgs || pkgs.length === 0) return;

    // 找到所有不同的貨架位置
    var shelfList = pkgs.map(function(p){ return p.shelf; }).filter(function(s){ return s && s !== '—' && s.trim(); });
    if(shelfList.length === 0) return;

    var uniqueShelves = [...new Set(shelfList)];
    var mainShelf = shelfList[0]; // 最新的貨架位置

    // ★ 防呆：如果同一客人有不同貨架位置，跳確認
    if(uniqueShelves.length > 1) {
      var shelfInfo = uniqueShelves.map(function(s){
        var cnt = shelfList.filter(function(x){return x===s}).length;
        return s + '(' + cnt + '件)';
      }).join('、');
      var useShelf = confirm('⚠️ 此客人有包裹在不同位置：\n\n' + shelfInfo + '\n\n確定使用「' + mainShelf + '」嗎？\n\n按「確定」使用 ' + mainShelf + '\n按「取消」自行輸入');
      if(!useShelf) {
        var customShelf = prompt('請輸入新貨架位置（例：A中、B下）');
        if(customShelf && customShelf.trim()) {
          mainShelf = customShelf.trim().toUpperCase();
        } else {
          return; // 取消不帶入
        }
      }
    }

    // ★ 核心：拆解貨架值，同步設定所有 UI 元素
    applyShelfToUI(mainShelf);

    showToast('📍 已自動帶入貨架：' + mainShelf + '（在庫 ' + pkgs.length + ' 件）', 'green');
  } catch(e) { console.error('autoFillShelf error:', e); }
}

// ★ 將貨架值完整套用到所有 UI 元素（下拉選單 + 結果 + 手動輸入 + 全域變數）
function applyShelfToUI(val) {
  if(!val) return;
  var letter = val.charAt(0).toUpperCase();
  var pos = val.length > 1 ? val.substring(1) : '';

  var letterEl = document.getElementById('shelf-letter');
  var posEl = document.getElementById('shelf-pos-select');
  var resultEl = document.getElementById('shelf-result');
  var manualEl = document.getElementById('shelf-manual');

  // 1) 貨架字母下拉
  if(letterEl && letter >= 'A' && letter <= 'Z') letterEl.value = letter;
  // 2) 層架下拉 + 同步全域 shelfPos
  if(posEl && ['上','中','下'].indexOf(pos) >= 0) {
    posEl.value = pos;
    shelfPos = pos;
  }
  // 3) 結果顯示
  if(resultEl) resultEl.textContent = val;
  // 4) 手動輸入欄（getShelfValue 優先讀取此欄位）
  if(manualEl) manualEl.value = val;
}

function toggleUnclaimed(checked) {
  var memberSection = document.getElementById('member-code-input');
  var avatar = document.getElementById('member-avatar');
  var name = document.getElementById('member-name');
  var email = document.getElementById('member-email');
  if(checked) {
    if(memberSection) memberSection.value = '';

    if(name) name.textContent = '無人包裹';
    if(email) email.textContent = '無法對應會員';
    if(currentPkg) currentPkg.memberCode = null;
    showToast('已標記為無人包裹');
  } else {

    if(name) name.textContent = '—';
    if(email) email.textContent = '—';
  }
}

// ── Lookup ────────────────────────────────────────
function lookupBarcode(code) {
  code = (code||'').trim().toUpperCase();
  if(!code) { showToast('請輸入包裹單號'); return; }

  // Try find in DB
  let pkg = packageDB[code];
  if(!pkg) {
    // Create new entry for unknown package
    pkg = {trackNo:code, memberCode:null, status:'unknown', weight:null, photos:[], note:''};
    packageDB[code] = pkg;
  }

  // ★ 連續掃碼模式：自動帶入鎖定的代號
  if(continuousMode && continuousMemberCode) {
    pkg.memberCode = continuousMemberCode;
  }

  currentPkg = pkg;
  // ★ 連續掃碼：保留自動擷取的照片；一般模式：清空重來
  if(!continuousMode) {
    uploadedPhotos = [];
  }
  renderDetailScreen(pkg);
  showScreen('screen-detail');

  // ★ 連續掃碼：帶入後自動查詢貨架
  if(continuousMode && continuousMemberCode) {
    autoFillShelfFromExisting(continuousMemberCode);
  }
}

function renderDetailScreen(pkg) {
  // Track info
  document.getElementById('detail-track-top').textContent = pkg.trackNo;
  document.getElementById('d-track').textContent = pkg.trackNo;
  document.getElementById('d-date').textContent = kstDate();
  document.getElementById('d-note').textContent = pkg.note || '（無備註）';

  // Status banner
  const banner = document.getElementById('status-banner');
  const dStatus = document.getElementById('d-status');
  if(pkg.status === 'arrived') {
    banner.style.background = 'var(--green-bg)';
    banner.style.color = 'var(--green)';
    banner.innerHTML = '✅ 此包裹已入庫（重複掃描確認）';
    dStatus.innerHTML = '<span class="pill pill-in">已入庫</span>';
  } else if(pkg.status === 'pending') {
    banner.style.background = 'rgba(27,79,138,0.06)';
    banner.style.color = 'var(--accent)';
    banner.innerHTML = '📦 新包裹－尚未入庫';
    dStatus.innerHTML = '<span class="pill pill-new">待入庫</span>';
  } else {
    banner.style.background = 'rgba(220,180,0,0.08)';
    banner.style.color = '#806000';
    banner.innerHTML = '⚠️ 系統未找到此包裹，請確認後入庫';
    dStatus.innerHTML = '<span class="pill" style="background:rgba(220,180,0,0.1);color:#806000">未知包裹</span>';
  }

  // Member info
  var memberCodeInput = document.getElementById('member-code-input');
  var isUnclaimedEl = document.getElementById('is-unclaimed');
  if(isUnclaimedEl) isUnclaimedEl.checked = false;

  var member = pkg.memberCode ? members[pkg.memberCode] : null;
  if(member) {
    
    document.getElementById('member-name').textContent = member.name;
    document.getElementById('member-email').textContent = member.email;
    if(memberCodeInput) memberCodeInput.value = pkg.memberCode;
  } else {
    document.getElementById('member-name').textContent = pkg.memberCode ? '找不到會員' : '請輸入會員代號';
    document.getElementById('member-email').textContent = pkg.memberCode || '—';
    if(memberCodeInput) memberCodeInput.value = pkg.memberCode || '';
  }

  // Weight
  const w = pkg.weight || '';
  document.getElementById('weight-input').value = w;
  document.getElementById('weight-display').textContent = w ? parseFloat(w).toFixed(2) : '0.00';

  // Photos
  renderPhotoGrid();
}

// ── Weight ────────────────────────────────────────
// ── Shelf ─────────────────────────────────────────
let shelfPos = '上';

function selectShelfPos(btn) {
  document.querySelectorAll('.shelf-pos-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  shelfPos = btn.dataset.pos;
  updateShelfDisplay();
  document.getElementById('shelf-manual').value = '';
}

function selectShelfPosSelect(val) {
  shelfPos = val;
  updateShelfDisplay();
  var manual = document.getElementById('shelf-manual');
  if(manual) manual.value = '';
}

function updateShelfDisplay() {
  const letterEl = document.getElementById('shelf-letter');
  const posEl = document.getElementById('shelf-pos-select');
  const display = document.getElementById('shelf-result');
  const manual = document.getElementById('shelf-manual');
  if(!letterEl || !display) return;
  const letter = letterEl.value;
  const pos = posEl ? posEl.value : shelfPos;
  if(letter && pos) {
    const result = letter + pos;
    display.textContent = result;
    if(manual) manual.value = result;
  } else {
    display.textContent = '—';
  }
}

function getShelfValue() {
  return document.getElementById('shelf-manual').value || document.getElementById('shelf-result').textContent || '—';
}

function addQuickNote(text) {
  var ta = document.getElementById('inbound-note');
  if(ta.value && ta.value.length > 0) { ta.value += ', '; }
  ta.value += text;
}

function updateWeightDisplay(val) {
  const num = parseFloat(val);
  const el = document.getElementById('weight-display');
  if(el) el.textContent = isNaN(num) ? '0.00' : num.toFixed(2);
}

function focusManualWeight() {
  document.getElementById('weight-input').focus();
}

// ── Bluetooth Scale ───────────────────────────────
async function connectBluetooth() {
  if(!navigator.bluetooth) {
    showToast('此裝置不支援 Web Bluetooth', 'red');
    return;
  }
  try {
    showToast('搜尋藍牙秤中...');
    btDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb', 'battery_service']
    });
    const server = await btDevice.gatt.connect();
    btConnected = true;
    updateBtStatus(true);
    showToast('藍牙秤已連接：'+btDevice.name, 'green');
  } catch(e) {
    if(e.name !== 'NotFoundError') {
      showToast('連接失敗：'+e.message, 'red');
    }
    // Demo mode
    btConnected = false;
    updateBtStatus(false);
  }
}

function updateBtStatus(connected) {
  const bar = document.getElementById('bt-bar');
  const txt = document.getElementById('bt-text');
  if(!bar || !txt) return;
  bar.className = 'bt-bar ' + (connected ? 'connected' : 'disconnected');
  txt.textContent = connected ? '藍牙秤已連接：'+(btDevice ? btDevice.name : 'Scale') : '點擊連接藍牙電子秤';
}

function readBtWeight() {
  if(!btConnected) {
    showToast('請先連接藍牙秤，或手動輸入重量', 'red');
    var wi = document.getElementById('weight-input');
    if(wi) wi.focus();
    return;
  }
  showToast('讀取秤重中...');
  // Real BT read would go here
}

// ── Photos ────────────────────────────────────────
function addPhotos(input) {
  Array.from(input.files).forEach(function(file){
    const reader = new FileReader();
    reader.onload = function(e){
      uploadedPhotos.push(e.target.result);
      renderPhotoGrid();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderPhotoGrid() {
  const grid = document.getElementById('photo-grid');
  let html = uploadedPhotos.map(function(src, i){
    return '<div class="photo-thumb"><img src="'+src+'" alt="photo '+i+'"><div style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);color:white;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer" onclick="removePhoto('+i+')">✕</div></div>';
  }).join('');
  html += '<div class="photo-add" onclick="document.getElementById(\'photo-input\').click()">＋</div>';
  grid.innerHTML = html;
}

function removePhoto(i) {
  uploadedPhotos.splice(i,1);
  renderPhotoGrid();
}

// ── Confirm Inbound ───────────────────────────────
async function confirmInbound() {
  if(!currentPkg) return;
  const weight = document.getElementById('weight-input').value;
  const note = document.getElementById('inbound-note').value;

  if(!weight || parseFloat(weight) <= 0) {
    showToast('請先輸入重量', 'red');
    document.getElementById('weight-input').focus();
    return;
  }

  // 確保會員代號有值（從輸入框讀取）
  var mcInput = document.getElementById('member-code-input');
  if(mcInput && mcInput.value.trim() && !currentPkg.memberCode) {
    var inputCode = mcInput.value.trim().toUpperCase();

    // ★ 防呆：檢查此代號是否真的存在
    var memberExists = !!members[inputCode];
    if(!memberExists && sb) {
      try {
        var { data: chk } = await sb.from('members').select('member_code').eq('member_code', inputCode).limit(1);
        if(chk && chk.length > 0) memberExists = true;
      } catch(e) {}
    }
    if(!memberExists) {
      var userChoice = confirm('⚠️ 會員代號「' + inputCode + '」查無此人！\n\n請確認：\n• 按「確定」→ 標記為無人包裹繼續入庫\n• 按「取消」→ 返回修正代號');
      if(!userChoice) return;
      currentPkg.memberCode = null;
      document.getElementById('is-unclaimed').checked = true;
      toggleUnclaimed(true);
    } else {
      currentPkg.memberCode = inputCode;
    }
  }
  console.log('📦 送出 member_code:', currentPkg.memberCode);

  var isUnclaimed = document.getElementById('is-unclaimed').checked;
  if(isUnclaimed) {
    currentPkg.memberCode = null;
    currentPkg.status = 'unclaimed';
    // Add to unclaimed list
    var today = kstDate({month:'2-digit',day:'2-digit'}).replace('/','/');
    var unclaimedNote = document.getElementById('inbound-note').value || '無法對應會員';
    var exists = unclaimedPkgs.find(function(u){ return u.trackNo === currentPkg.trackNo; });
    if(!exists) unclaimedPkgs.push({id:'U'+Date.now(), trackNo:currentPkg.trackNo, date:today, note:unclaimedNote});
  }

  // Update package
  const shelf = getShelfValue();
  if(!isUnclaimed) currentPkg.status = 'arrived';
  currentPkg.weight = weight;
  currentPkg.shelf = shelf;
  currentPkg.photos = [...uploadedPhotos];
  currentPkg.note = note;
  currentPkg.arrivedDate = kstDate();

  // Log staff action
  currentPkg.inboundBy = currentStaff;
  currentPkg.inboundTime = kstTime({hour:'2-digit',minute:'2-digit'});

  // 顯示上傳中（按鈕禁用）
  var confirmBtn = document.querySelector('.btn-confirm');
  if(confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span>⏳</span> 送出中...';
    confirmBtn.style.opacity = '0.6';
  }

  // 寫入 Supabase（含照片上傳）
  var saveResult = await saveToSupabase(currentPkg);

  // 恢復按鈕
  if(confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<span>📤</span> 送出入庫';
    confirmBtn.style.opacity = '';
  }

  // ── 寫入失敗：顯示錯誤，不計入數字 ──
  if(!saveResult || !saveResult.ok) {
    var errDetail = (saveResult && saveResult.msg) ? saveResult.msg : '未知錯誤';
    showToast('❌ 入庫寫入失敗：' + errDetail, 'red');
    console.error('❌ 入庫寫入失敗，不計入 todayCount。錯誤：', errDetail);
    // 提示可能原因
    setTimeout(function(){
      showToast('請檢查：① packages 表是否存在 ② tracking_no 是否有 UNIQUE 約束 ③ RLS 政策', 'red');
    }, 3000);
    return; // ← 不繼續，不計入數字
  }

  // 從 Supabase 重新讀取今日入庫數（真實數據）
  await updateTodayCount();
  // 非同步完整刷新首頁統計（loadDailyStats 也會同步 stat-inbound）
  await loadDailyStats();

  // Add to recent
  recentScans.unshift({
    trackNo: currentPkg.trackNo,
    memberCode: currentPkg.memberCode,
    weight: weight,
    time: kstTime({hour:'2-digit',minute:'2-digit'}),
    status: 'arrived'
  });
  recentScans = recentScans.slice(0,8);
  sessionStorage.setItem('recentScans', JSON.stringify(recentScans));
  renderRecent();

  // Show success
  const member = currentPkg.memberCode ? members[currentPkg.memberCode] : null;

  // ★ 連續掃碼模式：鎖定代號（首次入庫時自動記住）
  if(continuousMode && currentPkg.memberCode && !continuousMemberCode) {
    continuousMemberCode = currentPkg.memberCode;
    continuousMemberName = member ? member.name : null;
    updateContinuousBar();
  }
  // ★ 連續掃碼計數
  if(continuousMode) {
    continuousCount++;
    var cntEl = document.getElementById('continuous-count');
    if(cntEl) cntEl.textContent = '連續 ' + continuousCount + ' 件';
  }

  // ── 批量模式：快速顯示成功，自動下一件 ──
  if(batchMode) {
    batchCount++;
    var countEl = document.getElementById('batch-count');
    if(countEl) countEl.textContent = '本批 ' + batchCount + ' 件';
    showBatchSuccess(currentPkg.trackNo, parseFloat(weight).toFixed(1));
    // 自動跳到下一件
    setTimeout(function(){ scanNext(); }, 800);
    return;
  }

  // ── 連續掃碼模式（非批量）：顯示成功後自動下一件 ──
  if(continuousMode) {
    showBatchSuccess(currentPkg.trackNo, parseFloat(weight).toFixed(1));
    setTimeout(function(){ scanNext(); }, 800);
    return;
  }

  // ── 一般模式：顯示成功頁面 ──
  document.getElementById('success-track').textContent = currentPkg.trackNo;
  document.getElementById('success-detail').innerHTML =
    '會員：<strong>'+(member?member.name+' ('+currentPkg.memberCode+')':currentPkg.memberCode||'未知')+'</strong><br>'
    + '重量：<strong>'+parseFloat(weight).toFixed(2)+' kg</strong><br>'
    + '貨架：<strong>'+(currentPkg.shelf||'—')+'</strong><br>'
    + '照片：<strong>'+uploadedPhotos.length+'</strong> 張'+(uploadedPhotos.length > 0 ? ' ✅ 已上傳':'')+'<br>'
    + '時間：<strong>'+kstTime()+'</strong><br>'
    + '入庫人員：<strong style="color:var(--accent)">'+currentStaff+'</strong>';

  // 無人包裹標記
  var unclaimedNote = document.getElementById('success-unclaimed-note');
  if(unclaimedNote) unclaimedNote.style.display = isUnclaimed ? 'block' : 'none';

  showScreen('screen-success');
}

// ── Recent list ───────────────────────────────────
function renderRecent() {
  const el = document.getElementById('recent-items');
  if(!recentScans.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--text3);text-align:center;padding:12px">尚無掃件記錄</div>';
    return;
  }
  el.innerHTML = recentScans.map(function(s){
    return '<div class="recent-item" onclick="lookupBarcode(\''+s.trackNo+'\')">'
      + '<div><div class="recent-track">'+s.trackNo+'</div>'
      + '<div style="font-size:12px;color:var(--text3);margin-top:2px">'+(s.memberCode||'')+' · '+s.weight+' kg · '+s.time+'</div></div>'
      + '<span class="recent-status s-done">已入庫</span>'
      + '</div>';
  }).join('');
}

// ── 照片燈箱（Lightbox）：頁面內全螢幕檢視，支援左右切換 ──
var _lightboxUrls = [];
var _lightboxIndex = 0;

function viewPhoto(url) {
  viewPhotoGallery([url], 0);
}

function viewPhotoGallery(urls, startIndex) {
  if(!urls || urls.length === 0) return;
  _lightboxUrls = urls.map(resolvePhotoUrl).filter(function(u){ return !!u; });
  _lightboxIndex = startIndex || 0;
  if(_lightboxUrls.length === 0) return;
  _renderLightbox();
}

function _renderLightbox() {
  // 移除舊的燈箱
  var old = document.getElementById('photo-lightbox');
  if(old) old.remove();

  var url = _lightboxUrls[_lightboxIndex];
  var total = _lightboxUrls.length;
  var hasMultiple = total > 1;

  var overlay = document.createElement('div');
  overlay.id = 'photo-lightbox';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;box-sizing:border-box;touch-action:pan-y';

  // 頂部列：計數器 + 關閉按鈕
  var topBar = document.createElement('div');
  topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;z-index:2';
  if(hasMultiple) {
    var counter = document.createElement('div');
    counter.style.cssText = 'color:white;font-size:14px;font-weight:600;background:rgba(0,0,0,0.4);padding:4px 12px;border-radius:12px';
    counter.textContent = (_lightboxIndex+1) + ' / ' + total;
    topBar.appendChild(counter);
  } else {
    topBar.appendChild(document.createElement('div'));
  }
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:rgba(255,255,255,0.15);border:none;color:white;width:40px;height:40px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  closeBtn.onclick = function(){ overlay.remove(); };
  topBar.appendChild(closeBtn);
  overlay.appendChild(topBar);

  // 圖片
  var img = document.createElement('img');
  img.src = url;
  img.style.cssText = 'max-width:92vw;max-height:80vh;object-fit:contain;border-radius:8px;user-select:none;-webkit-user-select:none';
  img.onerror = function(){ this.style.display='none'; var err=document.createElement('div'); err.style.cssText='color:#ff6b6b;font-size:15px;padding:20px'; err.textContent='⚠️ 照片載入失敗'; overlay.insertBefore(err, overlay.children[1]); };
  overlay.appendChild(img);

  // 左右導航箭頭（多張時才顯示）
  if(hasMultiple) {
    var prevBtn = document.createElement('button');
    prevBtn.innerHTML = '‹';
    prevBtn.style.cssText = 'position:absolute;left:8px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:white;width:44px;height:44px;border-radius:50%;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
    prevBtn.onclick = function(e){ e.stopPropagation(); _lightboxIndex = (_lightboxIndex - 1 + total) % total; _renderLightbox(); };
    overlay.appendChild(prevBtn);

    var nextBtn = document.createElement('button');
    nextBtn.innerHTML = '›';
    nextBtn.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:white;width:44px;height:44px;border-radius:50%;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
    nextBtn.onclick = function(e){ e.stopPropagation(); _lightboxIndex = (_lightboxIndex + 1) % total; _renderLightbox(); };
    overlay.appendChild(nextBtn);
  }

  // 點擊背景關閉
  overlay.addEventListener('click', function(e) {
    if(e.target === overlay) overlay.remove();
  });

  // 手機觸控滑動支援
  var touchStartX = 0;
  overlay.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
  }, {passive: true});
  overlay.addEventListener('touchend', function(e) {
    if(!hasMultiple) return;
    var diff = e.changedTouches[0].clientX - touchStartX;
    if(Math.abs(diff) > 50) {
      if(diff < 0) { _lightboxIndex = (_lightboxIndex + 1) % total; }
      else { _lightboxIndex = (_lightboxIndex - 1 + total) % total; }
      _renderLightbox();
    }
  }, {passive: true});

  document.body.appendChild(overlay);
}

// ── Helper：安全解析 photo_urls（相容 JSON 字串 / 陣列 / null）──
function parsePhotoUrls(raw) {
  if(!raw) return [];
  if(Array.isArray(raw)) return raw;
  if(typeof raw === 'string') {
    var trimmed = raw.trim();
    if(trimmed.startsWith('[')) {
      try { var arr = JSON.parse(trimmed); if(Array.isArray(arr)) return arr; } catch(e){}
    }
    if(trimmed.length > 0) return [trimmed];
  }
  return [];
}

// ── Helper：將 Storage 路徑補全為完整公開 URL ──
function resolvePhotoUrl(url) {
  if(!url || typeof url !== 'string') return '';
  var u = url.trim();
  if(u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:')) return u;
  var base = SUPABASE_URL || 'https://zejkbveigebqiiwvosrd.supabase.co';
  if(u.startsWith('package') || u.startsWith('photo') || u.startsWith('ship') || u.startsWith('inbound')) {
    return base + '/storage/v1/object/public/' + u;
  }
  return base + '/storage/v1/object/public/package-photos/' + u;
}

// ── 圖片壓縮工具 ─────────────────────────────────
function compressImage(dataUrl, maxWidth, quality) {
  return new Promise(function(resolve){
    var img = new Image();
    img.onload = function(){
      var w = img.width, h = img.height;
      if(w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob(function(blob){ resolve(blob); }, 'image/jpeg', quality || 0.7);
    };
    img.src = dataUrl;
  });
}

// ── Supabase: 入庫寫入 packages 表 + 上傳照片 ──────
async function saveToSupabase(pkg) {
  if(!sb) return { ok: false, msg: '資料庫未連線（Supabase 未初始化）' };

  // 1) 上傳照片到 Supabase Storage
  var photoUrls = [];
  if(uploadedPhotos.length > 0) {
    for(var i = 0; i < uploadedPhotos.length; i++) {
      try {
        // 壓縮照片（最大寬度 1024px, JPEG 70%）
        var blob = await compressImage(uploadedPhotos[i], 1024, 0.7);
        var fileName = pkg.trackNo + '_' + Date.now() + '_' + i + '.jpg';
        var filePath = 'inbound/' + fileName;

        var { data: upData, error: upErr } = await sb.storage
          .from('package-photos')
          .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });

        if(upErr) {
          console.warn('照片上傳失敗:', String(upErr.message||upErr));
          continue;
        }

        // 取得公開網址
        var { data: urlData } = sb.storage
          .from('package-photos')
          .getPublicUrl(filePath);
        if(urlData && urlData.publicUrl) {
          photoUrls.push(urlData.publicUrl);
          console.log('✅ 照片上傳成功:', urlData.publicUrl);
        }
      } catch(e) { console.error('Photo upload error:', e); }
    }
  }

  // 2) 寫入 packages 表
  try {
    var row = {
      tracking_no: pkg.trackNo,
      member_code: pkg.memberCode || null,
      weight_kg: parseFloat(pkg.weight) || 0,
      shelf: pkg.shelf || null,
      note: pkg.note || null,
      status: pkg.status === 'unclaimed' ? 'unclaimed' : 'arrived',
      scanned_at: new Date().toISOString(),
      processed_by: currentStaffId,
      processed_by_name: currentStaffName
    };
    // 有照片才存 photo_urls
    if(photoUrls.length > 0) row.photo_urls = photoUrls;

    var { error } = await sb.from('packages').upsert(row, { onConflict: 'tracking_no' });
    if(error) {
      var errMsg = String(error.message || error.details || error.hint || JSON.stringify(error));
      console.error('❌ Supabase save error:', errMsg);
      return { ok: false, msg: errMsg };
    }
    console.log('✅ Saved to Supabase:', JSON.stringify({tracking_no:row.tracking_no, member_code:row.member_code, status:row.status, weight:row.weight_kg}), '(' + currentStaffName + ')');
    return { ok: true };
  } catch(e) {
    console.error(e);
    return { ok: false, msg: String(e.message || e) };
  }
}

// ── Tasks System ─────────────────────────────────
var allTasks = [];
var taskTab = 'pending';

function switchTaskTab(tab) {
  taskTab = tab;
  var pBtn = document.getElementById('task-tab-pending');
  var cBtn = document.getElementById('task-tab-completed');
  if(tab === 'pending') {
    pBtn.style.background = 'var(--accent)'; pBtn.style.color = 'white'; pBtn.style.borderColor = 'var(--accent)';
    cBtn.style.background = 'white'; cBtn.style.color = 'var(--text2)'; cBtn.style.borderColor = 'var(--border)';
  } else {
    cBtn.style.background = 'var(--accent)'; cBtn.style.color = 'white'; cBtn.style.borderColor = 'var(--accent)';
    pBtn.style.background = 'white'; pBtn.style.color = 'var(--text2)'; pBtn.style.borderColor = 'var(--border)';
  }
  renderTaskList();
}

async function loadTasks() {
  try {
    const { data, error } = await sb
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if(error) { console.error(error); showToast('載入待辦失敗','red'); return; }
    allTasks = data || [];
    var pending = allTasks.filter(function(t){ return t.status === 'pending'; });
    var completed = allTasks.filter(function(t){ return t.status === 'completed'; });
    document.getElementById('task-pending-count').textContent = pending.length;
    document.getElementById('task-completed-count').textContent = completed.length;
    renderTaskList();
  } catch(e) { console.error(e); }
}

function renderTaskList() {
  var el = document.getElementById('task-list');
  var filtered = allTasks.filter(function(t){ return t.status === taskTab; });
  if(filtered.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px;font-size:13px">'+(taskTab==='pending'?'沒有待處理的項目 🎉':'沒有已完成的記錄')+'</div>';
    return;
  }
  var typeIcon = {ship:'✈️',point:'🔍',pickup:'🏪'};
  var typeLabel = {ship:'出貨申請',point:'點貨申請',pickup:'預約自取'};
  el.innerHTML = filtered.map(function(t){
    var icon = typeIcon[t.task_type] || '📋';
    var label = typeLabel[t.task_type] || t.task_type;
    var date = t.created_at ? kstDateTimeStr(t.created_at,{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    var html = '<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;position:relative">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      + '<span style="font-size:20px">'+icon+'</span>'
      + '<div style="flex:1"><div style="font-size:14px;font-weight:600">'+label+'</div>'
      + '<div style="font-size:11px;color:var(--text3)">'+(t.member_code||'')+'  ·  '+date+'</div></div>';
    if(t.status === 'pending') {
      html += '<button onclick="completeTask(\''+t.id+'\')" style="background:var(--green);border:none;color:white;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">✓ 完成</button>';
    } else {
      html += '<span style="font-size:11px;color:var(--green);font-weight:600">✅ '+( t.completed_by_name||'')+'</span>';
    }
    html += '</div>';
    if(t.details) {
      html += '<div style="font-size:12px;color:var(--text2);background:var(--bg);border-radius:6px;padding:10px;line-height:1.7;white-space:pre-line">'+t.details+'</div>';
    }
    html += '</div>';
    return html;
  }).join('');
}

async function completeTask(taskId) {
  if(!confirm('確定完成此任務？')) return;
  try {
    // 直接從 Supabase 查詢任務（不依賴本地 allTasks）
    var { data: task, error: fetchErr } = await sb.from('tasks').select('*').eq('id', taskId).single();
    if(fetchErr || !task) { showToast('找不到此任務','red'); return; }

    const { error } = await sb
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: currentStaffId,
        completed_by_name: currentStaffName
      })
      .eq('id', taskId);
    if(error) { console.error(error); showToast('更新失敗','red'); return; }

    // 更新 packages 狀態
    var tType = task.task_type || task.type || '';
    var newStatus = '';
    if(tType === 'point') newStatus = 'point_done';
    else if(tType === 'pickup') newStatus = 'picked';
    else if(tType === 'ship') newStatus = 'shipping';

    if(newStatus && task.details) {
      var match = task.details.match(/包裹[：:]\s*(.+?)(\n|$)/);
      if(match) {
        var trackNos = match[1].split(/[,，、\s]+/);
        for(var i=0; i<trackNos.length; i++) {
          var tn = trackNos[i].trim();
          if(tn && tn.length > 5) await sb.from('packages').update({status:newStatus}).eq('tracking_no',tn);
        }
      }
    }

    showToast('任務已完成 ✅（'+currentStaffName+'）','green');
    loadTasks();
    loadPendingTicker();
    renderPointlistFromDB();
  } catch(e) { console.error(e); }
}

// ── 韓國時間格式化工具（確保所有顯示都是 KST）──
function kstDate(opts) {
  var o = Object.assign({}, opts || {});
  o.timeZone = 'Asia/Seoul';
  return new Date().toLocaleDateString('zh-TW', o);
}
function kstTime(opts) {
  var o = Object.assign({}, opts || {});
  o.timeZone = 'Asia/Seoul';
  return new Date().toLocaleTimeString('zh-TW', o);
}
function kstDateStr(d, opts) {
  var o = Object.assign({}, opts || {});
  o.timeZone = 'Asia/Seoul';
  return new Date(d).toLocaleDateString('zh-TW', o);
}
function kstDateTimeStr(d, opts) {
  var o = Object.assign({}, opts || {});
  o.timeZone = 'Asia/Seoul';
  return new Date(d).toLocaleString('zh-TW', o);
}

// ── 首頁統計 + Badge 更新（韓國時間 00:00 歸零）──
function getKSTTodayRange() {
  var now = new Date();
  // ★ 永遠加 9 小時 = KST（不管瀏覽器在什麼時區都正確）
  var kstMs = now.getTime() + 9 * 3600000;
  var kst = new Date(kstMs);
  // kst 的 getUTC* 現在就是 KST 的年月日
  var start = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600000);
  var end = new Date(start.getTime() + 24 * 3600000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function loadDailyStats() {
  var badge = document.getElementById('pending-badge');
  if(!sb) return;

  var range = getKSTTodayRange();
  var ds = range.start, de = range.end;
  console.log('📊 載入今日統計（KST）:', ds, '~', de);

  try {
    // ★ 高效查詢：用 count 取代 select('*')

    // 1) 今日入庫數（scanned_at 在今天範圍）
    var { count: inboundCount } = await sb.from('packages')
      .select('*', { count: 'exact', head: true })
      .gte('scanned_at', ds).lt('scanned_at', de);

    // 2) 無人包裹（全域，不限日期）
    var { count: unclaimedCount } = await sb.from('packages')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'unclaimed');

    // 3) 待出貨（task_type=ship, status=pending）
    var { count: pendingShipCount } = await sb.from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('task_type', 'ship').eq('status', 'pending');
    // fallback: type 欄位
    if(!pendingShipCount) {
      var r2 = await sb.from('tasks').select('*', { count: 'exact', head: true }).eq('type', 'ship').eq('status', 'pending');
      if(r2.count) pendingShipCount = r2.count;
    }

    // 4) 今日已出貨
    var { count: shippedCount } = await sb.from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('task_type', 'ship').in('status', ['completed','paid'])
      .gte('completed_at', ds).lt('completed_at', de);
    if(!shippedCount) {
      var r3 = await sb.from('tasks').select('*', { count: 'exact', head: true }).eq('type', 'ship').in('status', ['completed','paid']).gte('completed_at', ds).lt('completed_at', de);
      if(r3.count) shippedCount = r3.count;
    }

    // 5) 客人待處理申請（點貨/自取）
    var { count: pendingTaskCount } = await sb.from('tasks')
      .select('*', { count: 'exact', head: true })
      .in('task_type', ['point','pickup']).eq('status', 'pending');
    if(!pendingTaskCount) {
      var r4 = await sb.from('tasks').select('*', { count: 'exact', head: true }).in('type', ['point','pickup']).eq('status', 'pending');
      if(r4.count) pendingTaskCount = r4.count;
    }

    // 更新統計框
    var el;
    el = document.getElementById('stat-inbound');   if(el) el.textContent = inboundCount || 0;
    el = document.getElementById('stat-shipped');    if(el) el.textContent = shippedCount || 0;
    el = document.getElementById('stat-pending-ship'); if(el) el.textContent = pendingShipCount || 0;
    el = document.getElementById('stat-unclaimed');  if(el) el.textContent = unclaimedCount || 0;

    // 更新按鈕 badge（客人待處理）
    if(badge) {
      badge.textContent = pendingTaskCount || 0;
      badge.style.display = (pendingTaskCount > 0) ? 'inline-flex' : 'none';
    }

    // 更新無人包裹按鈕 badge
    var unclBadge = document.getElementById('home-unclaimed-badge');
    if(unclBadge) {
      unclBadge.textContent = unclaimedCount || 0;
      unclBadge.style.display = (unclaimedCount > 0) ? 'inline-flex' : 'none';
    }

    // 同步更新 todayCount
    todayCount = inboundCount || 0;
    var txt = '今日 ' + todayCount + ' 件';
    var el1 = document.getElementById('today-count');
    var el2 = document.getElementById('success-count');
    if(el1) el1.textContent = txt;
    if(el2) el2.textContent = txt;

    console.log('📊 今日統計：入庫', inboundCount||0, '已出貨', shippedCount||0, '待出貨', pendingShipCount||0, '無人', unclaimedCount||0, '待處理', pendingTaskCount||0);
  } catch(e) {
    console.error('loadDailyStats error:', e);
  }
}

// 保留舊名相容
function loadPendingTicker() { loadDailyStats(); }

// ── Supabase: 出貨訂單讀 tasks 表 ────────────────
async function renderShiplistFromDB() {
  var cards = document.getElementById('shiplist-cards');
  if(!cards) return;
  cards.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">載入中...</div>';
  try {
    // 查 task_type 或 type 欄位（相容舊版表結構）
    var { data, error } = await sb
      .from('tasks')
      .select('*')
      .eq('task_type', 'ship')
      .in('status', ['pending','completed'])
      .order('created_at', { ascending: false });
    // 如果 task_type 查不到，fallback 用 type 欄位
    if((!data || data.length === 0) && !error) {
      var res2 = await sb.from('tasks').select('*').eq('type', 'ship').in('status', ['pending','completed']).order('created_at', { ascending: false });
      if(res2.data && res2.data.length > 0) { data = res2.data; error = res2.error; }
    }
    if(error) { cards.innerHTML = '<div style="color:var(--red);padding:20px">載入失敗</div>'; return; }
    if(!data || data.length === 0) {
      cards.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px">目前沒有待處理的出貨申請</div>';
      return;
    }
    // 收集所有會員代號，批次查詢包裹資料
    var memberCodes = [...new Set(data.filter(function(t){return t.member_code}).map(function(t){return t.member_code}))];
    var memberAllPkgs = {};
    if(memberCodes.length > 0) {
      var { data: pkgRows } = await sb.from('packages').select('*').in('member_code', memberCodes);
      (pkgRows||[]).forEach(function(p){
        if(!memberAllPkgs[p.member_code]) memberAllPkgs[p.member_code] = [];
        memberAllPkgs[p.member_code].push(p);
      });
    }

    // 更新筆數
    var cntEl = document.getElementById('shiplist-count');
    if(cntEl) cntEl.textContent = data.filter(function(t){return t.status==='pending'}).length;

    cards.innerHTML = data.map(function(t){
      var date = t.created_at ? kstDateTimeStr(t.created_at,{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
      var isDone = t.status === 'completed';
      var cardBg = isDone ? 'rgba(0,0,0,0.03)' : 'var(--card)';
      var cardBorder = isDone ? 'rgba(0,0,0,0.08)' : 'var(--border)';
      var opacity = isDone ? '0.6' : '1';
      var details = t.details || '';
      var notes = t.notes || '';
      var allPkgs = memberAllPkgs[t.member_code] || [];

      // ★ 解析出貨方式
      var methodMatch = details.match(/出貨方式[：:]\s*(.+?)(\n|$)/);
      var shipMethod = 'air_transfer';
      if(methodMatch) {
        if(/直飛/.test(methodMatch[1])) shipMethod = 'air_direct';
        else if(/海運|海快/.test(methodMatch[1])) shipMethod = 'sea';
      }
      // ★ 箱子選項
      var boxes = BOX_SIZES[shipMethod] || BOX_SIZES.air_transfer;
      var boxOptionsHtml = '<option value="">請選擇箱子</option>';
      boxes.forEach(function(b){
        boxOptionsHtml += '<option value="'+b.name+'" data-min="'+b.minKg+'">'
          + b.name + (b.minKg > 0 ? '（最低'+b.minKg+'kg）' : '（自訂重量）') + '</option>';
      });

      // 解析出貨單號
      var shipMatch = details.match(/出貨單號[：:]\s*(.+?)(\n|$)/);
      var shipTrackNos = shipMatch ? shipMatch[1].split(/[,，、\s]+/).map(function(s){return s.trim()}).filter(Boolean) : [];
      var _completedS = ['delivered','picked','transit','shipping'];
      // 從包裹列表中找出指定單號
      var shipPkgs = shipTrackNos.length > 0
        ? allPkgs.filter(function(p){ return shipTrackNos.includes(p.tracking_no); })
        : allPkgs.filter(function(p){ return !_completedS.includes(p.status); });
      // 剩餘在庫（排除已完成 + 已指定出貨的）
      var remainPkgs = allPkgs.filter(function(p){ return !_completedS.includes(p.status) && !shipTrackNos.includes(p.tracking_no); });

      var html = '<div style="background:'+cardBg+';border:1px solid '+cardBorder+';border-radius:10px;padding:14px;margin-bottom:12px;opacity:'+opacity+'">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        + '<div><span style="font-weight:700;font-size:14px">'+(isDone?'✅':'✈️')+' '+t.title+'</span>'
        + (isDone?'<span style="font-size:11px;color:var(--green);margin-left:8px;background:rgba(40,180,100,0.1);padding:2px 8px;border-radius:4px;font-weight:700">已包裝完成</span>':'')
        + '<br><span style="font-size:12px;color:var(--text3);font-weight:600">'+(t.member_code||'—')+'</span>'
        + '<span style="font-size:11px;color:var(--text3);margin-left:8px">'+date+'</span></div>'
        + '</div>';

      // 客人需求明細
      if(details) {
        var styledDetails = details
          .replace(/(出貨方式[：:]\s*.+)/g, '<span style="color:#1B4F8A;font-weight:700;font-size:13px">✈️ $1</span>')
          .replace(/(特殊需求[：:]\s*.+)/g, '<span style="color:#dc3c3c;font-weight:700;font-size:13px">⚠️ $1</span>')
          .replace(/(裝箱[：:]\s*.+)/g, '<span style="color:#e67e22;font-weight:700">📦 $1</span>')
          .replace(/(付款[：:]\s*.+)/g, '<span style="color:var(--text3);font-style:italic">$1</span>')
          .replace(/(包裹數[：:]\s*.+)/g, '<span style="color:#8e44ad;font-weight:700;font-size:13px">📮 $1</span>');
        html += '<div style="font-size:12px;color:var(--text2);background:var(--bg);border-radius:6px;padding:10px;line-height:1.9;white-space:pre-line;margin-bottom:8px">'+styledDetails+'</div>';
      }
      if(notes) {
        html += '<div style="font-size:11px;color:var(--red);background:rgba(220,60,60,0.05);border:1px solid rgba(220,60,60,0.15);border-radius:6px;padding:8px 10px;margin-bottom:8px;line-height:1.5">⚠️ 備註：'+notes+'</div>';
      }

      // 出貨包裹（★ 簡化版：只顯示單號 + 在庫摘要）
      if(shipPkgs.length > 0) {
        html += '<div style="background:rgba(27,79,138,0.04);border:1px solid rgba(27,79,138,0.1);border-radius:6px;padding:10px;margin-bottom:8px">';
        // 出貨單號（每行一個）
        shipPkgs.forEach(function(p){
          var tn = p.tracking_no || '';
          var tnHtml = tn.length > 4
            ? tn.slice(0,-4) + '<span style="color:#dc3c3c;font-weight:800">' + tn.slice(-4) + '</span>'
            : '<span style="color:#dc3c3c;font-weight:800">' + tn + '</span>';
          var shelfTag = p.shelf ? ' <span style="background:rgba(220,60,60,0.1);color:#dc3c3c;font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px">📍'+p.shelf+'</span>' : '';
          html += '<div style="font-family:monospace;font-size:12px;padding:3px 0;color:var(--text)">📦 '+tnHtml+shelfTag+'</div>';
        });
        // ★ 客人全部在庫包裹的貨架摘要（含出貨包裹，出貨位置標紅）
        var _cs = ['delivered','picked','transit','shipping'];
        var allInStock = allPkgs.filter(function(p){ return !_cs.includes(p.status); });
        // 合併：在庫 + 本次出貨包裹（去重，因出貨包裹可能 status='shipping' 被排除）
        var allWarehouse = allInStock.slice();
        shipPkgs.forEach(function(sp){
          if(!allWarehouse.find(function(p){ return p.tracking_no === sp.tracking_no; })) {
            allWarehouse.push(sp);
          }
        });
        // 貨架統計 + 標記出貨位置
        var shelfMap = {};
        allWarehouse.forEach(function(p){
          if(p.shelf) {
            if(!shelfMap[p.shelf]) shelfMap[p.shelf] = { total:0, shipping:0 };
            shelfMap[p.shelf].total++;
          }
        });
        shipPkgs.forEach(function(p){
          if(p.shelf && shelfMap[p.shelf]) shelfMap[p.shelf].shipping++;
        });
        // 生成摘要：出貨位置紅色，其他正常
        var shelfSummary = Object.keys(shelfMap).sort().map(function(s){
          var info = shelfMap[s];
          if(info.shipping > 0) {
            return '<span style="background:rgba(220,60,60,0.1);color:#dc3c3c;font-weight:700;padding:1px 6px;border-radius:3px">📍'+s+'('+info.total+')</span>';
          }
          return '📍'+s+'('+info.total+')';
        }).join(' ');
        if(!shelfSummary && allPkgs.length > 0) {
          var anyShelf = allPkgs.find(function(p){ return p.shelf; });
          if(anyShelf) shelfSummary = '📍'+anyShelf.shelf;
        }
        if(allWarehouse.length > 0) {
          html += '<div style="font-size:12px;color:var(--text2);margin-top:6px;padding-top:6px;border-top:1px dashed rgba(27,79,138,0.15)">📦 客人在庫包裹（<strong>'+allWarehouse.length+'</strong> 件）'+(shelfSummary ? ' '+shelfSummary : '')+'</div>';
        }
        html += '</div>';
      }

      // 包裝完成表單（未完成時顯示）
      if(!isDone) {
        html += '<div style="background:rgba(40,180,100,0.04);border:1px solid rgba(40,180,100,0.15);border-radius:8px;padding:12px;margin-top:6px">'
          + '<div style="font-size:12px;font-weight:700;color:var(--green);margin-bottom:10px">📦 包裝完成填寫</div>'
          + '<input type="hidden" id="ship-method-'+t.id+'" value="'+shipMethod+'">'
          // ★ 箱子尺寸
          + '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">'
          + '<label style="font-size:12px;color:var(--text2);min-width:70px">箱子尺寸</label>'
          + '<select id="ship-box-'+t.id+'" onchange="calcShipCost(\''+t.id+'\')" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;outline:none;background:white;font-family:inherit">'
          + boxOptionsHtml
          + '</select></div>'
          // ★ 實際重量
          + '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">'
          + '<label style="font-size:12px;color:var(--text2);min-width:70px">實際重量</label>'
          + '<input id="ship-weight-'+t.id+'" type="number" step="0.1" placeholder="公斤" oninput="calcShipCost(\''+t.id+'\')" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;outline:none">'
          + '<span style="font-size:12px;color:var(--text3)">kg</span></div>'
          // ★ 計費重量（自動計算顯示）
          + '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">'
          + '<label style="font-size:12px;color:var(--text2);min-width:70px">計費重量</label>'
          + '<span id="ship-billing-'+t.id+'" style="font-size:13px;font-weight:700;color:var(--text)">—</span></div>'
          // ★ 新箱選擇
          + '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">'
          + '<label style="font-size:12px;color:var(--text2);min-width:70px">新箱</label>'
          + '<button id="newbox-yes-'+t.id+'" onclick="selectNewBox(\''+t.id+'\',true)" style="flex:1;padding:8px;border:2px solid var(--border);border-radius:6px;background:var(--bg2);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--text2)">是</button>'
          + '<button id="newbox-no-'+t.id+'" onclick="selectNewBox(\''+t.id+'\',false)" style="flex:1;padding:8px;border:2px solid var(--accent);border-radius:6px;background:rgba(27,79,138,0.1);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--accent)">否</button>'
          + '<input type="hidden" id="ship-newbox-'+t.id+'" value="no">'
          + '</div>'
          // 報關行
          + '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">'
          + '<label style="font-size:12px;color:var(--text2);min-width:70px">報關行</label>'
          + '<button id="broker-df-'+t.id+'" onclick="selectBroker(\''+t.id+'\',\'東風\')" style="flex:1;padding:10px;border:2px solid var(--border);border-radius:8px;background:var(--bg2);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--text2)">東風</button>'
          + '<button id="broker-hh-'+t.id+'" onclick="selectBroker(\''+t.id+'\',\'鴻海\')" style="flex:1;padding:10px;border:2px solid var(--border);border-radius:8px;background:var(--bg2);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--text2)">鴻海</button>'
          + '<input type="hidden" id="ship-tracking-'+t.id+'" value="">'
          + '</div>'
          // ★ 運費（自動計算，雙幣顯示）
          + '<div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">'
          + '<label style="font-size:12px;color:var(--text2);min-width:70px">運費</label>'
          + '<div id="ship-cost-'+t.id+'" style="flex:1">—</div>'
          + '</div>'
          // 拍照
          + '<div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">'
          + '<label style="font-size:12px;color:var(--text2);min-width:70px">包裝照片</label>'
          + '<input id="ship-photo-'+t.id+'" type="file" accept="image/*" capture="environment" style="display:none" onchange="previewShipPhoto(\''+t.id+'\',this)">'
          + '<button onclick="document.getElementById(\'ship-photo-'+t.id+'\').click()" style="background:var(--accent);border:none;color:white;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">📷 拍照上傳</button>'
          + '<span id="ship-photo-name-'+t.id+'" style="font-size:11px;color:var(--text3)"></span>'
          + '</div>'
          + '<div id="ship-photo-preview-'+t.id+'" style="display:none;margin-bottom:10px"></div>'
          // 送出按鈕
          + '<div style="display:flex;gap:8px;margin-top:4px">'
          + '<button onclick="confirmShipPacking(\''+t.id+'\')" style="flex:3;background:var(--green);border:none;color:white;padding:12px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">✅ 包裝完成送出</button>'
          + '<button onclick="cancelShipTask(\''+t.id+'\',\''+t.member_code+'\')" style="flex:1;background:rgba(220,60,60,0.08);border:1.5px solid rgba(220,60,60,0.25);color:var(--red);padding:12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">🗑️ 取消</button>'
          + '</div>'
          + '</div>';
      }

      if(t.completed_by_name) {
        html += '<div style="font-size:10px;color:var(--text3);margin-top:6px;text-align:right">處理人員：'+t.completed_by_name+'</div>';
      }
      // 已完成：顯示包裝資訊
      if(isDone) {
        html += '<div style="background:rgba(40,180,100,0.05);border:1px solid rgba(40,180,100,0.15);border-radius:6px;padding:10px;margin-top:6px">'
          + '<div style="font-size:12px;font-weight:600;color:var(--green);margin-bottom:6px">✅ 已包裝完成</div>';
        // 從 notes 解析箱子、計費重量、TWD
        var tn = t.notes || '';
        var boxMatch = tn.match(/箱子:([^|]+)/);
        var twdMatch = tn.match(/TWD:(\d+)/);
        var methodMatch2 = tn.match(/方式:([^|]+)/);
        var newBoxMatch = tn.match(/新箱:是/);
        if(boxMatch) html += '<div style="font-size:12px;color:var(--text2)">箱子：<strong>'+boxMatch[1]+'</strong></div>';
        if(methodMatch2) html += '<div style="font-size:12px;color:var(--text2)">出貨方式：<strong>'+methodMatch2[1]+'</strong></div>';
        if(t.ship_weight) html += '<div style="font-size:12px;color:var(--text2)">計費重量：<strong>'+t.ship_weight+' kg</strong></div>';
        if(newBoxMatch) html += '<div style="font-size:12px;color:var(--text2)">新箱：<strong>是</strong></div>';
        if(t.ship_logistic) html += '<div style="font-size:12px;color:var(--text2)">報關行：<strong>'+t.ship_logistic+'</strong></div>';
        if(t.ship_cost) {
          var twdAmt = twdMatch ? 'NT$'+Number(twdMatch[1]).toLocaleString() : '';
          html += '<div style="font-size:13px;color:var(--accent);font-weight:700;margin-top:4px">運費：₩'+Number(t.ship_cost).toLocaleString()+(twdAmt ? '（'+twdAmt+'）' : '')+'</div>';
        }
        if(t.ship_photo) html += '<div style="margin-top:6px"><img src="'+t.ship_photo+'" style="width:100%;max-height:160px;object-fit:cover;border-radius:6px;border:1px solid var(--border)"></div>';
        html += '</div>';
      }
      html += '</div>';
      return html;
    }).join('');
  } catch(e) { console.error(e); }
}

// ★ 員工取消出貨（含確認警告）
async function cancelShipTask(taskId, memberCode) {
  if(!confirm('⚠️ 確定要取消此出貨申請？\n\n取消後：\n• 客人的包裹狀態會回到「已到庫」\n• 此出貨任務會被刪除\n\n按「確定」繼續取消')) return;
  if(!sb) { showToast('資料庫未連線','red'); return; }

  try {
    // 1) 從 task 的 details 中解析出出貨單號
    var { data: task } = await sb.from('tasks').select('details').eq('id', taskId).single();
    var trackNos = [];
    if(task && task.details) {
      var match = task.details.match(/出貨單號[：:]\s*(.+?)(\n|$)/);
      if(match) trackNos = match[1].split(/[,，、\s]+/).map(function(s){return s.trim()}).filter(Boolean);
    }

    // 2) 將相關包裹狀態改回 arrived
    if(trackNos.length > 0) {
      for(var i = 0; i < trackNos.length; i++) {
        await sb.from('packages').update({ status: 'arrived', updated_at: new Date().toISOString() })
          .eq('tracking_no', trackNos[i]);
      }
    } else if(memberCode) {
      // fallback：把該客人所有 shipping 狀態的包裹改回 arrived
      await sb.from('packages').update({ status: 'arrived', updated_at: new Date().toISOString() })
        .eq('member_code', memberCode).eq('status', 'shipping');
    }

    // 3) 刪除 task
    await sb.from('tasks').delete().eq('id', taskId);

    showToast('✅ 已取消出貨，包裹已恢復「已到庫」', 'green');
    renderShiplistFromDB(); // 重新整理列表
    loadDailyStats(); // 更新首頁統計
  } catch(e) {
    console.error('cancelShipTask error:', e);
    showToast('取消失敗：' + e.message, 'red');
  }
}
function previewShipPhoto(taskId, input) {
  var nameEl = document.getElementById('ship-photo-name-'+taskId);
  var previewEl = document.getElementById('ship-photo-preview-'+taskId);
  if(input.files && input.files[0]) {
    if(nameEl) nameEl.textContent = '✅ ' + input.files[0].name;
    if(previewEl) {
      var url = URL.createObjectURL(input.files[0]);
      previewEl.innerHTML = '<img src="'+url+'" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">';
      previewEl.style.display = 'block';
    }
  }
}

// ── 箱子尺寸與最低計費重量 ──
var BOX_SIZES = {
  air_direct: [
    { name: '八號箱', minKg: 3 },
    { name: '七號箱', minKg: 5 },
    { name: '六號箱', minKg: 7 },
    { name: '五號箱', minKg: 11 },
    { name: '四號箱', minKg: 17 },
    { name: '三號箱', minKg: 24 },
    { name: '二號箱', minKg: 34 },
    { name: '一號箱', minKg: 42 },
    { name: '其他', minKg: 0 }
  ],
  air_transfer: [
    { name: '三號箱', minKg: 20 },
    { name: '二號箱', minKg: 30 },
    { name: '一號箱', minKg: 38 },
    { name: '其他', minKg: 0 }
  ],
  sea: [
    { name: '三號箱', minKg: 20 },
    { name: '二號箱', minKg: 30 },
    { name: '一號箱', minKg: 38 },
    { name: '其他', minKg: 0 }
  ]
};

// 新箱費用
var NEW_BOX_FEE_KRW = 2000;
var NEW_BOX_FEE_TWD = 40;

// ── 運費計算（箱子尺寸 + 首重續重 + 新箱費用 + 雙幣顯示）──
function calcShipCost(taskId) {
  var wEl = document.getElementById('ship-weight-'+taskId);
  var costEl = document.getElementById('ship-cost-'+taskId);
  var billingEl = document.getElementById('ship-billing-'+taskId);
  var boxEl = document.getElementById('ship-box-'+taskId);
  var methodEl = document.getElementById('ship-method-'+taskId);
  var newboxEl = document.getElementById('ship-newbox-'+taskId);

  if(!costEl) return;

  var w = wEl ? parseFloat(wEl.value) : 0;
  var method = methodEl ? methodEl.value : 'air_transfer';
  var isNewBox = newboxEl ? newboxEl.value === 'yes' : false;

  // 取得箱子最低重量
  var boxMinKg = 0;
  var boxName = '';
  if(boxEl && boxEl.value) {
    boxName = boxEl.value;
    var opt = boxEl.options[boxEl.selectedIndex];
    boxMinKg = opt ? parseInt(opt.dataset.min || '0') : 0;
  }

  if(!boxName && !w) {
    costEl.textContent = '請選擇箱子並輸入重量';
    if(billingEl) billingEl.textContent = '—';
    costEl.dataset.cost = ''; costEl.dataset.costTwd = '';
    return;
  }

  // 計費重量 = max(進位實際重量, 箱子最低重量)
  var actualW = w > 0 ? Math.ceil(w) : 0;
  var billingW = boxMinKg > 0 ? Math.max(actualW, boxMinKg) : actualW;

  if(billingW <= 0) {
    costEl.textContent = boxName === '其他' ? '請輸入重量' : '請選擇箱子或輸入重量';
    if(billingEl) billingEl.textContent = '—';
    costEl.dataset.cost = ''; costEl.dataset.costTwd = '';
    return;
  }

  // 顯示計費重量
  if(billingEl) {
    if(boxMinKg > 0 && actualW < boxMinKg) {
      billingEl.innerHTML = '<strong>' + billingW + ' kg</strong>（箱子最低 ' + boxMinKg + ' kg，實際 ' + (actualW||0) + ' kg）';
      billingEl.style.color = '#e67e22';
    } else if(boxMinKg > 0 && actualW >= boxMinKg) {
      billingEl.innerHTML = '<strong>' + billingW + ' kg</strong>（超過箱子最低 ' + boxMinKg + ' kg）';
      billingEl.style.color = 'var(--green)';
    } else {
      billingEl.innerHTML = '<strong>' + billingW + ' kg</strong>';
      billingEl.style.color = 'var(--text)';
    }
  }

  // ★ 計算 KRW 運費
  var costKRW = 0;
  if(method === 'air_direct') {
    var fK = 14800, cK = 10000;
    costKRW = billingW <= 5 ? (fK + (billingW - 1) * cK) : (billingW * cK);
  } else if(method === 'air_transfer') {
    var fK = 14300, cK = 9500;
    costKRW = billingW <= 4 ? (fK + (billingW - 1) * cK) : (billingW * cK);
  } else if(method === 'sea') {
    var seaW = Math.max(5, billingW);
    costKRW = seaW * 6300;
    billingW = seaW; // 海快最低5kg
  }

  // ★ 計算 TWD 運費
  var costTWD = 0;
  if(method === 'air_direct') {
    costTWD = billingW <= 5 ? (335 + (billingW - 1) * 215) : (billingW * 215);
  } else if(method === 'air_transfer') {
    costTWD = billingW <= 4 ? (325 + (billingW - 1) * 205) : (billingW * 205);
  } else if(method === 'sea') {
    costTWD = Math.max(5, billingW) * 135;
  }

  // ★ 新箱費用
  var newBoxKRW = isNewBox ? NEW_BOX_FEE_KRW : 0;
  var newBoxTWD = isNewBox ? NEW_BOX_FEE_TWD : 0;

  var totalKRW = costKRW + newBoxKRW;
  var totalTWD = costTWD + newBoxTWD;

  // ★ 顯示雙幣
  var methodLabel = method === 'air_direct' ? '直飛' : (method === 'sea' ? '海快' : '轉機');
  var display = '₩' + totalKRW.toLocaleString() + '（NT$' + totalTWD.toLocaleString() + '）';
  var detail = methodLabel + ' ' + billingW + 'kg';
  if(isNewBox) detail += ' +新箱';
  costEl.innerHTML = '<div style="font-size:16px;font-weight:800;color:var(--accent)">₩' + totalKRW.toLocaleString() + '</div>'
    + '<div style="font-size:13px;color:#e67e22;font-weight:600">NT$' + totalTWD.toLocaleString() + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + detail + '</div>';

  // 儲存數據
  costEl.dataset.cost = totalKRW;
  costEl.dataset.costTwd = totalTWD;
  costEl.dataset.method = method;
  costEl.dataset.billingWeight = billingW;
  costEl.dataset.boxName = boxName;
  costEl.dataset.newBox = isNewBox ? 'yes' : 'no';
}

// ── 新箱選擇 ──
function selectNewBox(taskId, isYes) {
  var yesBtn = document.getElementById('newbox-yes-'+taskId);
  var noBtn = document.getElementById('newbox-no-'+taskId);
  var hidden = document.getElementById('ship-newbox-'+taskId);
  var activeStyle = 'border:2px solid var(--accent);background:rgba(27,79,138,0.1);color:var(--accent)';
  var inactiveStyle = 'border:2px solid var(--border);background:var(--bg2);color:var(--text2)';
  if(isYes) {
    if(yesBtn) yesBtn.style.cssText = 'flex:1;padding:8px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;' + activeStyle;
    if(noBtn) noBtn.style.cssText = 'flex:1;padding:8px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;' + inactiveStyle;
    if(hidden) hidden.value = 'yes';
  } else {
    if(noBtn) noBtn.style.cssText = 'flex:1;padding:8px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;' + activeStyle;
    if(yesBtn) yesBtn.style.cssText = 'flex:1;padding:8px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;' + inactiveStyle;
    if(hidden) hidden.value = 'no';
  }
  calcShipCost(taskId);
}

// ── 報關行選擇 ──
function selectBroker(taskId, broker) {
  var dfBtn = document.getElementById('broker-df-'+taskId);
  var hhBtn = document.getElementById('broker-hh-'+taskId);
  var hiddenInput = document.getElementById('ship-tracking-'+taskId);
  if(dfBtn) { dfBtn.style.border = '2px solid var(--border)'; dfBtn.style.background = 'var(--bg2)'; dfBtn.style.color = 'var(--text2)'; }
  if(hhBtn) { hhBtn.style.border = '2px solid var(--border)'; hhBtn.style.background = 'var(--bg2)'; hhBtn.style.color = 'var(--text2)'; }
  if(broker === '東風' && dfBtn) { dfBtn.style.border = '2px solid var(--accent)'; dfBtn.style.background = 'rgba(27,79,138,0.1)'; dfBtn.style.color = 'var(--accent)'; }
  if(broker === '鴻海' && hhBtn) { hhBtn.style.border = '2px solid var(--accent)'; hhBtn.style.background = 'rgba(27,79,138,0.1)'; hhBtn.style.color = 'var(--accent)'; }
  if(hiddenInput) hiddenInput.value = broker;
}

// ── 包裝完成確認（含箱子、計費重量、雙幣運費、照片）──
async function confirmShipPacking(taskId) {
  try {
    const { data: task, error } = await sb.from('tasks').select('*').eq('id', taskId).single();
    if(error || !task) { showToast('找不到此任務','red'); return; }

    var weightEl = document.getElementById('ship-weight-'+taskId);
    var trackingEl = document.getElementById('ship-tracking-'+taskId);
    var costEl = document.getElementById('ship-cost-'+taskId);
    var photoEl = document.getElementById('ship-photo-'+taskId);
    var boxEl = document.getElementById('ship-box-'+taskId);

    var shipWeight = weightEl ? parseFloat(weightEl.value) : 0;
    var shipTracking = trackingEl ? trackingEl.value.trim() : '';
    var shipCostKRW = costEl && costEl.dataset.cost ? parseInt(costEl.dataset.cost) : 0;
    var shipCostTWD = costEl && costEl.dataset.costTwd ? parseInt(costEl.dataset.costTwd) : 0;
    var billingWeight = costEl && costEl.dataset.billingWeight ? parseInt(costEl.dataset.billingWeight) : 0;
    var boxName = costEl && costEl.dataset.boxName ? costEl.dataset.boxName : '';
    var shipMethod = costEl && costEl.dataset.method ? costEl.dataset.method : '';
    var isNewBox = costEl && costEl.dataset.newBox === 'yes';

    if(!boxName && !shipWeight) { showToast('請選擇箱子尺寸','red'); return; }
    if(!shipWeight) { showToast('請填寫實際重量','red'); return; }
    if(!shipTracking) { showToast('請選擇報關行','red'); return; }
    if(!shipCostKRW) { calcShipCost(taskId); showToast('請確認運費金額','red'); return; }
    // ★ 強制要求包裝照片
    if(!photoEl || !photoEl.files || !photoEl.files[0]) {
      showToast('📷 請先拍照上傳包裝完成照片','red'); return;
    }

    // ★ 壓縮 + 上傳包裝照片
    var shipPhotoUrl = '';
    try {
      var photoFile = photoEl.files[0];
      var photoDataUrl = await new Promise(function(resolve, reject){
        var reader = new FileReader();
        reader.onload = function(e){ resolve(e.target.result); };
        reader.onerror = function(){ reject(new Error('讀取照片失敗')); };
        reader.readAsDataURL(photoFile);
      });
      var compressedBlob = await compressImage(photoDataUrl, 1024, 0.7);
      var fname = 'ship/' + taskId + '_' + Date.now() + '.jpg';

      var { data: upData, error: upErr } = await sb.storage
        .from('package-photos')
        .upload(fname, compressedBlob, { contentType: 'image/jpeg', upsert: true });

      if(upErr) {
        console.error('❌ 包裝照片上傳失敗:', upErr.message || upErr);
        showToast('❌ 照片上傳失敗：' + (upErr.message||'未知錯誤'), 'red');
        return;
      }

      var { data: urlData } = sb.storage.from('package-photos').getPublicUrl(fname);
      shipPhotoUrl = (urlData && urlData.publicUrl) ? urlData.publicUrl : '';
      if(!shipPhotoUrl) {
        showToast('❌ 無法取得照片網址', 'red');
        return;
      }
      console.log('✅ 包裝照片上傳成功:', shipPhotoUrl);
    } catch(photoErr) {
      console.error('包裝照片處理異常:', photoErr);
      showToast('❌ 照片處理失敗，請重試', 'red');
      return;
    }

    var methodLabel = shipMethod === 'air_direct' ? '直飛' : (shipMethod === 'sea' ? '海快' : '轉機');
    var confirmMsg = '確認包裝完成？\n\n'
      + '📦 箱子：' + (boxName || '—') + '\n'
      + '⚖️ 實際重量：' + shipWeight + ' kg\n'
      + '⚖️ 計費重量：' + billingWeight + ' kg\n'
      + '🚚 出貨方式：' + methodLabel + '\n'
      + '🏢 報關行：' + shipTracking + '\n'
      + (isNewBox ? '📦 新箱：是\n' : '')
      + '💰 運費：₩' + shipCostKRW.toLocaleString() + '（NT$' + shipCostTWD.toLocaleString() + '）\n'
      + '📷 照片：✅ 已上傳';
    if(!confirm(confirmMsg)) return;

    // 立即更新 UI
    var packForm = document.getElementById('ship-weight-'+taskId);
    var targetCard = null;
    if(packForm) {
      targetCard = packForm.closest('div[style*="border-radius:10px"]');
      if(targetCard) {
        targetCard.style.opacity = '0.5';
        targetCard.style.background = 'rgba(0,0,0,0.03)';
        var formDiv = packForm.closest('div[style*="rgba(40,180,100"]');
        if(formDiv) formDiv.innerHTML = '<div style="text-align:center;padding:16px;color:var(--green);font-weight:700;font-size:14px">⏳ 正在儲存包裝資料...</div>';
      }
    }

    // ★ 組合備註資訊（含箱子、計費重量、TWD、新箱）
    var shipNotes = '箱子:' + boxName + '|計費:' + billingWeight + 'kg|方式:' + methodLabel + '|TWD:' + shipCostTWD;
    if(isNewBox) shipNotes += '|新箱:是';

    // 更新 task 狀態 + 儲存包裝資訊
    var { error: updateErr } = await sb.from('tasks').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: currentStaffId,
      completed_by_name: currentStaffName,
      ship_weight: billingWeight,
      ship_logistic: shipTracking,
      ship_cost: shipCostKRW,
      ship_photo: shipPhotoUrl,
      notes: (task.notes ? task.notes + '\n' : '') + shipNotes
    }).eq('id', taskId);

    if(updateErr) { showToast('❌ 更新失敗：'+updateErr.message,'red'); return; }

    // 更新該會員出貨包裹狀態
    var details = task.details || '';
    var shipMatch = details.match(/出貨單號[：:]\s*(.+?)(\n|$)/);
    if(shipMatch) {
      var trackNos = shipMatch[1].split(/[,，、\s]+/).filter(Boolean);
      for(var i=0; i<trackNos.length; i++) {
        await sb.from('packages').update({status:'shipping', logistic_no: shipTracking, shipped_at: new Date().toISOString()}).eq('tracking_no',trackNos[i].trim());
      }
    } else if(task.member_code) {
      await sb.from('packages').update({status:'shipping', logistic_no: shipTracking, shipped_at: new Date().toISOString()}).eq('member_code', task.member_code).eq('status','arrived');
    }

    showToast('✅ 包裝完成（'+currentStaffName+'）','green');

    // 立即在 DOM 中把該卡片標記為完成
    if(targetCard) {
      targetCard.style.opacity = '0.6';
      targetCard.style.background = 'rgba(0,0,0,0.03)';
      targetCard.style.border = '1px solid rgba(0,0,0,0.08)';
      // 找到包裝表單區域替換為完成資訊
      var forms = targetCard.querySelectorAll('div[style*="rgba(40,180,100"]');
      if(forms.length === 0) forms = targetCard.querySelectorAll('div[style*="text-align:center"]');
      forms.forEach(function(f){ 
        var methodLbl = shipMethod === 'air_direct' ? '直飛' : (shipMethod === 'sea' ? '海快' : '轉機');
        f.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--green);padding:8px">✅ 已包裝完成</div>'
          + '<div style="font-size:12px;color:var(--text2)">箱子：<strong>'+(boxName||'—')+'</strong></div>'
          + '<div style="font-size:12px;color:var(--text2)">出貨方式：<strong>'+methodLbl+'</strong></div>'
          + '<div style="font-size:12px;color:var(--text2)">計費重量：<strong>'+billingWeight+' kg</strong></div>'
          + (isNewBox ? '<div style="font-size:12px;color:var(--text2)">新箱：<strong>是</strong></div>' : '')
          + '<div style="font-size:12px;color:var(--text2)">報關行：<strong>'+shipTracking+'</strong></div>'
          + '<div style="font-size:13px;color:var(--accent);font-weight:700;margin-top:4px">運費：₩'+shipCostKRW.toLocaleString()+'（NT$'+shipCostTWD.toLocaleString()+'）</div>';
      });
    }

    // 背景重新載入完整資料（多次刷新確保儀表板數字即時更新）
    loadDailyStats();
    renderShiplistFromDB();
    setTimeout(function(){ loadDailyStats(); }, 2000);
  } catch(e) { console.error(e); showToast('操作失敗','red'); }
}

// ── Supabase: 點貨/自取讀 tasks 表 ────────────────
async function renderPointlistFromDB() {
  var cards = document.getElementById('pointlist-cards');
  if(!cards) return;
  cards.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">載入中...</div>';
  try {
    const { data, error } = await sb
      .from('tasks')
      .select('*')
      .in('task_type', ['point','pickup'])
      .in('status', ['pending','completed'])
      .order('created_at', { ascending: false });
    var finalData = data;
    if((!data || data.length === 0) && !error) {
      var res2 = await sb.from('tasks').select('*').in('type', ['point','pickup']).in('status', ['pending','completed']).order('created_at', { ascending: false });
      if(res2.data && res2.data.length > 0) finalData = res2.data;
    }
    if(!finalData) finalData = data;
    if(error) { cards.innerHTML = '<div style="color:var(--red);padding:20px">載入失敗</div>'; return; }
    if(!finalData || finalData.length === 0) {
      cards.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px">目前沒有待處理的點貨/自取申請</div>';
      return;
    }

    // 批次查詢所有會員的包裹
    var memberCodes = [...new Set(finalData.filter(function(t){return t.member_code}).map(function(t){return t.member_code}))];
    var memberPkgMap = {};
    if(memberCodes.length > 0) {
      var { data: pkgRows } = await sb.from('packages').select('*').in('member_code', memberCodes).in('status',['arrived','checking','pointed','point_done','carried','wait_pickup','unclaimed']).order('created_at',{ascending:false});
      (pkgRows||[]).forEach(function(p){
        if(!memberPkgMap[p.member_code]) memberPkgMap[p.member_code] = [];
        memberPkgMap[p.member_code].push(p);
      });
    }

    var typeIcon = {point:'🔍 點貨',pickup:'🏪 自取'};
    cards.innerHTML = finalData.map(function(t){
      var date = t.created_at ? kstDateTimeStr(t.created_at,{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
      var isDone = t.status === 'completed';
      var tType = t.task_type || t.type || '';
      var cardBg = isDone ? 'rgba(0,0,0,0.02)' : 'var(--card)';
      var opacity = isDone ? '0.65' : '1';
      var memberPkgs = memberPkgMap[t.member_code] || [];

      // 解析申請的包裹單號
      var reqMatch = t.details ? t.details.match(/包裹[：:]\s*(.+?)(\n|$)/) : null;
      var reqTrackNos = reqMatch ? reqMatch[1].split(/[,，、\s]+/).map(function(s){return s.trim()}).filter(Boolean) : [];

      var html = '<div style="background:'+cardBg+';border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;opacity:'+opacity+'">'
        // 標題列
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        + '<div><span style="font-weight:700;font-size:14px">'+(isDone?'✅':'')+(typeIcon[tType]||'')+' '+t.title+'</span>'
        + '<br><span style="font-size:12px;color:var(--text3);font-weight:600">'+(t.member_code||'—')+'</span>'
        + '<span style="font-size:11px;color:var(--text3);margin-left:8px">'+date+'</span></div>'
        + (isDone ? '<span style="font-size:11px;padding:3px 8px;border-radius:4px;background:rgba(40,180,100,0.1);color:var(--green);font-weight:600">已完成</span>' : '')
        + '</div>';

      // 客人需求明細
      if(t.details) {
        html += '<div style="font-size:12px;color:var(--text2);background:var(--bg);border-radius:6px;padding:10px;line-height:1.7;white-space:pre-line;margin-bottom:8px">'+t.details+'</div>';
      }

      // ★ 包裹明細表格
      if(memberPkgs.length > 0 && !isDone) {
        html += '<div style="background:rgba(27,79,138,0.04);border:1px solid rgba(27,79,138,0.1);border-radius:6px;padding:10px;margin-bottom:8px">'
          + '<div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:6px">📦 客人在庫包裹（' + memberPkgs.length + ' 件）</div>';
        memberPkgs.forEach(function(p){
          var isRequested = reqTrackNos.includes(p.tracking_no);
          html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(27,79,138,0.08);flex-wrap:wrap;'+(isRequested?'background:rgba(27,79,138,0.06);border-radius:4px;padding:6px 4px;':'') +'">'
            + (isRequested ? '<span style="font-size:10px;color:white;background:var(--accent);padding:1px 6px;border-radius:3px;font-weight:600">申請</span>' : '')
            + '<span style="font-family:monospace;font-size:11px;min-width:100px">'+(p.tracking_no||'')+'</span>'
            + '<span style="font-size:11px;color:var(--text3)">'+(p.weight_kg||0)+'kg</span>'
            + '<span style="font-size:11px;font-weight:600;color:var(--accent)">📍'+(p.shelf||'—')+'</span>'
            + '</div>';
        });
        html += '</div>';
      }

      // ★ 未完成：拍照 + 完成/取消按鈕
      if(!isDone) {
        html += '<div style="background:rgba(40,180,100,0.04);border:1px solid rgba(40,180,100,0.15);border-radius:8px;padding:12px;margin-top:6px">'
          + '<div style="font-size:12px;font-weight:700;color:var(--green);margin-bottom:8px">📷 ' + (tType==='point'?'點貨':'自取') + '照片（完成時上傳）</div>'
          + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">'
          + '<input id="point-photo-'+t.id+'" type="file" accept="image/*" capture="environment" style="display:none" onchange="previewPointPhoto(\''+t.id+'\',this)">'
          + '<button onclick="document.getElementById(\'point-photo-'+t.id+'\').click()" style="background:var(--accent);border:none;color:white;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">📷 拍照</button>'
          + '<span id="point-photo-name-'+t.id+'" style="font-size:11px;color:var(--text3)">尚未拍照</span>'
          + '</div>'
          + '<div id="point-photo-preview-'+t.id+'" style="display:none;margin-bottom:8px"></div>'
          + '<div style="display:flex;gap:8px">'
          + '<button onclick="completePointTask(\''+t.id+'\')" style="flex:3;background:var(--green);border:none;color:white;padding:12px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">✅ 完成</button>'
          + '<button onclick="cancelPointTask(\''+t.id+'\')" style="flex:1;background:rgba(220,60,60,0.08);border:1.5px solid rgba(220,60,60,0.25);color:var(--red);padding:12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">取消</button>'
          + '</div>'
          + '</div>';
      }

      // ★ 已完成：顯示完成照片
      if(isDone) {
        html += '<div style="background:rgba(40,180,100,0.05);border:1px solid rgba(40,180,100,0.15);border-radius:6px;padding:10px;margin-top:6px">'
          + '<div style="font-size:12px;font-weight:600;color:var(--green);margin-bottom:4px">✅ 已完成' + (t.completed_by_name ? ' · ' + t.completed_by_name : '') + '</div>';
        if(t.ship_photo) {
          var resolved = resolvePhotoUrl(t.ship_photo);
          html += '<img src="'+resolved+'" style="width:100%;max-height:200px;object-fit:cover;border-radius:6px;margin-top:6px;cursor:pointer" onclick="viewPhoto(\''+resolved+'\')">';
        }
        html += '</div>';
      }

      html += '</div>';
      return html;
    }).join('');
  } catch(e) { console.error(e); }
}

// ── 點貨照片預覽 ──
function previewPointPhoto(taskId, input) {
  var preview = document.getElementById('point-photo-preview-' + taskId);
  var nameEl = document.getElementById('point-photo-name-' + taskId);
  if(!input.files || !input.files[0]) return;
  var file = input.files[0];
  if(nameEl) nameEl.textContent = '✅ 已選擇照片';
  var reader = new FileReader();
  reader.onload = function(e) {
    if(preview) {
      preview.style.display = 'block';
      preview.innerHTML = '<img src="'+e.target.result+'" style="width:100%;max-height:160px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">';
    }
  };
  reader.readAsDataURL(file);
}

// ── 完成點貨/自取（含照片上傳）──
async function completePointTask(taskId) {
  if(!confirm('確定完成此任務？')) return;

  var photoEl = document.getElementById('point-photo-' + taskId);
  var photoUrl = '';

  // ★ 上傳照片（如果有）
  if(photoEl && photoEl.files && photoEl.files[0]) {
    try {
      var photoDataUrl = await new Promise(function(resolve, reject){
        var reader = new FileReader();
        reader.onload = function(e){ resolve(e.target.result); };
        reader.onerror = function(){ reject(new Error('讀取照片失敗')); };
        reader.readAsDataURL(photoEl.files[0]);
      });
      var compressedBlob = await compressImage(photoDataUrl, 1024, 0.7);
      var fname = 'point/' + taskId + '_' + Date.now() + '.jpg';
      var { data: upData, error: upErr } = await sb.storage
        .from('package-photos')
        .upload(fname, compressedBlob, { contentType: 'image/jpeg', upsert: true });
      if(!upErr && upData) {
        photoUrl = 'package-photos/' + upData.path;
        console.log('📷 點貨照片已上傳:', photoUrl);
      }
    } catch(e) { console.error('上傳點貨照片失敗:', e); }
  }

  try {
    var { data: task, error: fetchErr } = await sb.from('tasks').select('*').eq('id', taskId).single();
    if(fetchErr || !task) { showToast('找不到此任務','red'); return; }

    var updateData = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: currentStaffId,
      completed_by_name: currentStaffName
    };
    if(photoUrl) updateData.ship_photo = photoUrl; // 存照片 URL

    const { error } = await sb.from('tasks').update(updateData).eq('id', taskId);
    if(error) { console.error(error); showToast('更新失敗','red'); return; }

    // 更新 packages 狀態
    var tType = task.task_type || task.type || '';
    var newStatus = (tType === 'point') ? 'point_done' : (tType === 'pickup') ? 'picked' : '';
    if(newStatus && task.member_code) {
      // 嘗試從 details 解析包裹單號
      var match = task.details ? task.details.match(/包裹[：:]\s*(.+?)(\n|$)/) : null;
      if(match) {
        var trackNos = match[1].split(/[,，、\s]+/);
        for(var i = 0; i < trackNos.length; i++) {
          var tn = trackNos[i].trim();
          if(tn && tn.length > 5) await sb.from('packages').update({status: newStatus}).eq('tracking_no', tn);
        }
      }
    }

    showToast('✅ 任務已完成（' + currentStaffName + '）', 'green');
    renderPointlistFromDB();
    loadDailyStats();
  } catch(e) { console.error(e); }
}

// ── 取消點貨/自取申請 ──
async function cancelPointTask(taskId) {
  if(!confirm('⚠️ 確定要取消此申請？\n\n取消後包裹狀態會回到「已到庫」。')) return;
  try {
    var { data: task } = await sb.from('tasks').select('*').eq('id', taskId).single();
    if(task && task.details) {
      var match = task.details.match(/包裹[：:]\s*(.+?)(\n|$)/);
      if(match) {
        var trackNos = match[1].split(/[,，、\s]+/);
        for(var i = 0; i < trackNos.length; i++) {
          var tn = trackNos[i].trim();
          if(tn && tn.length > 5) await sb.from('packages').update({status:'arrived'}).eq('tracking_no', tn);
        }
      }
    }
    await sb.from('tasks').delete().eq('id', taskId);
    showToast('✅ 已取消申請', 'green');
    renderPointlistFromDB();
    loadDailyStats();
  } catch(e) { console.error(e); showToast('取消失敗','red'); }
}

// ── Supabase: 包裹查詢 ──────────────────────────
// 快取查詢結果以供詳情彈窗使用
var _queryPkgCache = [];
var _currentEditPkgId = null;
var _statusMap = {arrived:'已到庫',checking:'點貨中',point_done:'點貨完成',wait_pickup:'待自取',picked:'已自取',shipping:'出貨中',delivered:'已出貨',unclaimed:'無人包裹'};

// ── 共用：渲染單一包裹卡片（可點擊開啟詳情）──
function renderPkgCard(p, idx) {
  var entryDate = p.scanned_at ? kstDateStr(p.scanned_at) : (p.created_at ? kstDateStr(p.created_at) : '—');
  var photos = parsePhotoUrls(p.photo_urls);
  var photoCount = photos.length > 0 ? ' · 📷'+photos.length+'張' : '';
  var statusColor = p.status==='arrived' ? 'rgba(27,79,138,0.1);color:var(--accent)' : (p.status==='unclaimed' ? 'rgba(220,60,60,0.1);color:var(--red)' : 'rgba(40,180,100,0.1);color:#1a8050');
  return '<div onclick="openPkgDetailModal('+idx+')" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:8px;cursor:pointer;transition:box-shadow 0.2s" onmouseenter="this.style.boxShadow=\'0 2px 12px rgba(0,0,0,0.12)\'" onmouseleave="this.style.boxShadow=\'none\'">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<span style="font-family:monospace;font-size:14px;font-weight:700">'+(p.tracking_no||'')+'</span>'
    + '<span style="font-size:11px;padding:3px 8px;border-radius:4px;background:'+statusColor+';font-weight:600">'+ (_statusMap[p.status]||p.status||'—')+'</span>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-top:6px;display:flex;flex-wrap:wrap;gap:8px">'
    + '<span>會員：'+(p.member_code||'—')+'</span>'
    + '<span>重量：'+(p.weight_kg||0)+' kg</span>'
    + '<span>貨架：'+(p.shelf||'—')+'</span>'
    + (photos.length > 0 ? '<span style="color:var(--accent)">📷'+photos.length+'張</span>' : '')
    + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:4px">入庫：'+entryDate+(p.processed_by_name?' · '+p.processed_by_name:'')+'</div>'
    // 照片縮圖（最多顯示3張）
    + (photos.length > 0 ? '<div style="display:flex;gap:6px;margin-top:8px;overflow-x:auto">' + photos.slice(0,3).map(function(url){ var resolved = resolvePhotoUrl(url); return '<img src="'+resolved+'" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" onerror="this.style.display=\'none\'">'; }).join('') + (photos.length > 3 ? '<div style="width:50px;height:50px;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:6px;font-size:12px;color:var(--text3)">+' + (photos.length-3) + '</div>' : '') + '</div>' : '')
    + '</div>';
}

// ── 開啟包裹詳情彈窗 ──
function openPkgDetailModal(idx) {
  var p = _queryPkgCache[idx];
  if(!p) { showToast('找不到包裹資料','red'); return; }
  _currentEditPkgId = p.id;

  // 填入唯讀資料
  document.getElementById('pkg-detail-tracking').textContent = p.tracking_no || '—';
  document.getElementById('pkg-detail-status').innerHTML = '<span style="padding:4px 12px;border-radius:6px;background:rgba(27,79,138,0.1);color:var(--accent);font-weight:600;font-size:13px">' + (_statusMap[p.status]||p.status||'—') + '</span>';
  var entryDate = p.scanned_at ? kstDateTimeStr(p.scanned_at,{}) : (p.created_at ? kstDateTimeStr(p.created_at,{}) : '—');
  document.getElementById('pkg-detail-time').textContent = entryDate + (p.processed_by_name ? ' · ' + p.processed_by_name : '');

  // 填入可編輯欄位
  document.getElementById('pkg-edit-member').value = p.member_code || '';
  document.getElementById('pkg-edit-weight').value = p.weight_kg || '';
  document.getElementById('pkg-edit-shelf').value = p.shelf || '';
  document.getElementById('pkg-edit-note').value = p.note || '';

  // 渲染入庫照片
  var photosEl = document.getElementById('pkg-detail-photos');
  var photos = parsePhotoUrls(p.photo_urls);
  // 預存已解析的 URL 供燈箱使用
  window._detailPhotoUrls = photos.map(resolvePhotoUrl).filter(function(u){ return !!u; });
  if(photos.length > 0) {
    photosEl.innerHTML = photos.map(function(url, i) {
      var resolved = resolvePhotoUrl(url);
      return '<div style="position:relative">'
        + '<img src="'+resolved+'" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer" onclick="viewPhotoGallery(window._detailPhotoUrls,'+i+')" onerror="this.parentElement.innerHTML=\'<div style=padding:8px;text-align:center;color:#999;font-size:11px>⚠️ 載入失敗</div>\'">'
        + '<div style="position:absolute;bottom:2px;right:4px;background:rgba(0,0,0,0.5);color:white;font-size:10px;padding:1px 5px;border-radius:3px">'+(i+1)+'</div>'
        + '</div>';
    }).join('');
  } else {
    photosEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px;background:var(--bg);border-radius:8px;width:100%">此包裹尚無入庫照片</div>';
  }

  // 清除訊息
  document.getElementById('pkg-detail-msg').textContent = '';

  // 顯示彈窗
  document.getElementById('pkg-detail-modal').style.display = 'block';
}

// ── 關閉詳情彈窗 ──
function closePkgDetailModal() {
  document.getElementById('pkg-detail-modal').style.display = 'none';
  _currentEditPkgId = null;
}

// ── 儲存修改 ──
async function savePkgDetail() {
  if(!_currentEditPkgId) { showToast('無法辨識包裹','red'); return; }
  if(!sb) { showToast('資料庫未連線','red'); return; }

  var memberCode = (document.getElementById('pkg-edit-member').value || '').trim().toUpperCase();
  var weightKg = parseFloat(document.getElementById('pkg-edit-weight').value) || 0;
  var shelf = (document.getElementById('pkg-edit-shelf').value || '').trim();
  var note = (document.getElementById('pkg-edit-note').value || '').trim();

  var msgEl = document.getElementById('pkg-detail-msg');
  var saveBtn = document.getElementById('pkg-detail-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ 儲存中...';
  msgEl.textContent = '';

  try {
    var { error } = await sb.from('packages').update({
      member_code: memberCode || null,
      weight_kg: weightKg,
      shelf: shelf || null,
      note: note || null,
      updated_at: new Date().toISOString()
    }).eq('id', _currentEditPkgId);

    if(error) {
      msgEl.innerHTML = '<span style="color:var(--red)">❌ 儲存失敗：' + (error.message||'未知錯誤') + '</span>';
      console.error('儲存包裹失敗:', error);
    } else {
      msgEl.innerHTML = '<span style="color:var(--green)">✅ 儲存成功！</span>';
      showToast('✅ 包裹資料已更新', 'green');
      // 同步更新快取中的資料
      var cached = _queryPkgCache.find(function(p){ return p.id === _currentEditPkgId; });
      if(cached) {
        cached.member_code = memberCode || null;
        cached.weight_kg = weightKg;
        cached.shelf = shelf || null;
        cached.note = note || null;
      }
      // 延遲關閉彈窗並重新整理列表
      setTimeout(function(){
        closePkgDetailModal();
        loadRecentPackagesDB(); // 重新載入查詢列表
      }, 800);
    }
  } catch(e) {
    msgEl.innerHTML = '<span style="color:var(--red)">❌ 儲存異常</span>';
    console.error('儲存包裹異常:', e);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 儲存修改';
  }
}
// ── 進入查詢頁時自動載入近一年所有包裹（真實 Supabase 資料）──
async function loadRecentPackagesDB() {
  var results = document.getElementById('query-results');
  if(!results) return;
  if(!sb) { results.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">資料庫未連線</div>'; return; }
  results.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">載入一年內包裹資料...</div>';
  try {
    var oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    var { data, error } = await sb
      .from('packages')
      .select('*')
      .gte('created_at', oneYearAgo.toISOString())
      .order('scanned_at', { ascending: false })
      .limit(200);
    if(error) { results.innerHTML = '<div style="color:var(--red);padding:20px">載入失敗：' + (error.message||'') + '</div>'; return; }
    if(!data || data.length === 0) {
      results.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3)"><div style="font-size:28px;margin-bottom:8px">📦</div>一年內無入庫記錄</div>';
      return;
    }
    var statusMap = _statusMap;
    _queryPkgCache = data; // 快取供詳情彈窗使用
    results.innerHTML = '<div style="font-size:12px;color:var(--text3);margin-bottom:8px;display:flex;justify-content:space-between"><span>共 '+data.length+' 筆（近一年）</span><span style="color:var(--accent)">可搜尋篩選 ↑</span></div>'
      + '<div style="font-size:11px;color:var(--text3);margin-bottom:6px;text-align:center">👆 點擊包裹可查看照片 / 修改資料</div>'
      + data.map(function(p, idx){
      return renderPkgCard(p, idx);
    }).join('');
  } catch(e) { results.innerHTML = '<div style="color:var(--red);padding:20px">載入異常</div>'; console.error(e); }
}

async function runStaffQueryDB() {
  var input = document.getElementById('query-input');
  var val = (input.value||'').trim().toUpperCase();
  if(!val) { showToast('請輸入查詢條件'); return; }
  var results = document.getElementById('query-results');
  results.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">查詢中...</div>';

  // Calculate 1-year-ago date
  var oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  var yearFilter = oneYearAgo.toISOString();

  try {
    // 先用 tracking_no 查
    var { data, error } = await sb
      .from('packages')
      .select('*')
      .ilike('tracking_no', '%'+val+'%')
      .gte('created_at', yearFilter)
      .order('created_at', { ascending: false })
      .limit(50);
    // 如果沒結果，試 member_code
    if((!data || data.length === 0) && !error) {
      var res2 = await sb
        .from('packages')
        .select('*')
        .ilike('member_code', '%'+val+'%')
        .gte('created_at', yearFilter)
        .order('created_at', { ascending: false })
        .limit(50);
      data = res2.data;
      error = res2.error;
    }
    if(error) { results.innerHTML = '<div style="color:var(--red);padding:20px">查詢失敗</div>'; return; }
    if(!data || data.length === 0) {
      results.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">找不到符合的包裹（僅搜尋一年內記錄）</div>';
      return;
    }
    var statusMap = _statusMap;
    _queryPkgCache = data; // 快取供詳情彈窗使用
    results.innerHTML = '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">共 '+data.length+' 筆結果（一年內）· 👆 點擊可修改</div>' + data.map(function(p, idx){
      return renderPkgCard(p, idx);
    }).join('');
  } catch(e) { console.error(e); }
}

// ══════════════════════════════════════════════════
// ── 客戶資料搜尋（從 Supabase 連動）──
// ══════════════════════════════════════════════════
async function searchCustomerDB() {
  var input = document.getElementById('customer-search-input');
  var code = (input.value||'').trim().toUpperCase();
  var result = document.getElementById('customer-result');
  if(!code) { showToast('請輸入會員代號'); return; }
  result.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">搜尋中...</div>';

  try {
    // 1) 查會員
    var { data: memberData } = await sb.from('members').select('*').ilike('member_code', '%'+code+'%').limit(5);
    // 2) 查包裹
    var { data: pkgData } = await sb.from('packages').select('*').ilike('member_code', '%'+code+'%').order('created_at', { ascending: false }).limit(100);

    if((!memberData || memberData.length === 0) && (!pkgData || pkgData.length === 0)) {
      result.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3)">找不到會員代號：'+code+'</div>';
      return;
    }

    var statusMap = {arrived:'已到庫',checking:'點貨中',point_done:'點貨完成',wait_pickup:'待自取',picked:'已自取',shipping:'出貨中',delivered:'已出貨',unclaimed:'無人包裹'};
    var html = '';

    // 會員資訊卡（含貨架位置 + 等級）
    if(memberData && memberData.length > 0) {
      // 計算等級（上月空運重量）
      var { data: taskData } = await sb.from('tasks').select('*');
      var now = new Date();
      var lastMonth = new Date(now.getFullYear(), now.getMonth()-1, 1);
      var lastMonthStr = lastMonth.getFullYear()+'-'+(lastMonth.getMonth()+1<10?'0':'')+(lastMonth.getMonth()+1);

      memberData.forEach(function(m){
        // 找出該會員的主要貨架位置（★ 在庫 = 排除已出貨/已自取/運輸中）
        var _doneStatuses = ['delivered','picked','transit','shipping'];
        var memberPkgs = (pkgData||[]).filter(function(p){ return p.member_code === m.member_code && !_doneStatuses.includes(p.status); });
        var shelfList = memberPkgs.map(function(p){ return p.shelf; }).filter(function(s){ return s && s !== '—'; });
        var mainShelf = shelfList.length > 0 ? shelfList[0] : '—';

        // 計算上月空運重量 → 決定等級
        var memberTasks = (taskData||[]).filter(function(t){
          return t.member_code === m.member_code && (t.status==='completed'||t.status==='paid')
            && (t.task_type==='ship'||t.type==='ship') && (t.details||'').indexOf('空運') >= 0;
        });
        var lastMonthAirKg = memberTasks.filter(function(t){ return (t.created_at||'').substring(0,7)===lastMonthStr; })
          .reduce(function(s,t){ return s+(t.ship_weight||0); }, 0);
        var grade = lastMonthAirKg >= 300 ? 'VVIP' : (lastMonthAirKg >= 100 ? 'VIP' : '一般');
        var gradeColor = grade==='VVIP' ? '#b8860b' : (grade==='VIP' ? '#c4953a' : 'var(--accent)');
        var gradeNote = grade==='VVIP' ? '空運折抵 ₩10/kg' : (grade==='VIP' ? '空運折抵 ₩5/kg' : '無折扣');
        var thisMonthAirKg = memberTasks.filter(function(t){ 
          var ms = now.getFullYear()+'-'+(now.getMonth()+1<10?'0':'')+(now.getMonth()+1);
          return (t.created_at||'').substring(0,7)===ms; 
        }).reduce(function(s,t){ return s+(t.ship_weight||0); }, 0);

        html += '<div style="background:var(--card);border:2px solid var(--accent);border-radius:10px;padding:14px;margin-bottom:12px">'
          + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
          + '<div style="background:var(--accent);color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px">👤</div>'
          + '<div><div style="font-weight:700;font-size:15px">'+(m.member_code||code)+'</div>'
          + '<div style="font-size:12px;color:var(--text3)">'+(m.name||'—')+' · '+(m.phone||'—')+'</div></div></div>'
          + '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--text3);align-items:center">'
          + '<span style="font-weight:700;color:'+gradeColor+';background:'+gradeColor+'15;padding:2px 10px;border-radius:4px">'+(grade==='VVIP'?'👑 ':'')+(grade==='VIP'?'⭐ ':'')+grade+'</span>'
          + '<span style="color:'+gradeColor+'">'+gradeNote+'</span>'
          + '<span>📍 貨架：<strong style="color:var(--accent)">'+mainShelf+'</strong></span>'
          + '<span>LINE：'+(m.line_id||'—')+'</span>'
          + '</div>'
          + '<div style="font-size:11px;color:var(--text3);margin-top:6px">本月空運：'+thisMonthAirKg.toFixed(1)+' kg'
          + (grade==='一般' ? '（滿 100kg 升 VIP）' : (grade==='VIP' ? '（滿 300kg 升 VVIP）' : ''))
          + '</div></div>';
      });
    }

    // 包裹列表（★ 在庫 = 排除已出貨/已自取/運輸中，與客人端統一）
    var pkgs = pkgData || [];
    var completedStatuses = ['delivered','picked','transit','shipping'];
    var arrivedCount = pkgs.filter(function(p){ return !completedStatuses.includes(p.status); }).length;
    var searchedCode = memberData && memberData.length > 0 ? memberData[0].member_code : code;
    html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">'
      + '<div style="font-weight:700;font-size:14px">📦 包裹記錄（共 '+pkgs.length+' 筆，在庫 '+arrivedCount+' 筆）</div>';
    if(arrivedCount > 0) {
      html += '<button onclick="bulkChangeShelf(\''+searchedCode+'\','+arrivedCount+')" style="background:var(--accent);border:none;color:white;font-size:12px;font-weight:600;padding:8px 14px;border-radius:6px;cursor:pointer">📍 一鍵更換貨架</button>';
    }
    html += '</div>';

    if(pkgs.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:var(--text3)">此會員無包裹記錄</div>';
    } else {
      pkgs.forEach(function(p){
        var entryDate = p.scanned_at ? kstDateStr(p.scanned_at) : (p.created_at ? kstDateStr(p.created_at) : '—');
        var photos = p.photo_urls || [];
        var statusColor = p.status==='arrived' ? 'rgba(27,79,138,0.1);color:var(--accent)' : (p.status==='unclaimed' ? 'rgba(220,60,60,0.1);color:var(--red)' : 'rgba(40,180,100,0.1);color:#1a8050');
        html += '<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">'
          + '<span style="font-family:monospace;font-size:13px;font-weight:600">'+(p.tracking_no||'')+'</span>'
          + '<span style="font-size:11px;padding:3px 8px;border-radius:4px;background:'+statusColor+'">'+(statusMap[p.status]||p.status||'—')+'</span>'
          + '</div>'
          + '<div style="font-size:12px;color:var(--text3);margin-top:6px;display:flex;flex-wrap:wrap;gap:8px">'
          + '<span>'+(p.weight_kg||0)+' kg</span>'
          + '<span>📍 貨架：'+(p.shelf||'—')+'</span>'
          + '<span>📅 '+entryDate+'</span>'
          + (p.processed_by_name ? '<span>👷 '+p.processed_by_name+'</span>' : '')
          + '</div>';
        // 照片縮圖
        if(photos.length > 0) {
          html += '<div style="display:flex;gap:6px;margin-top:8px;overflow-x:auto">';
          photos.forEach(function(url){
            html += '<img src="'+url+'" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer" onclick="viewPhoto(\''+url+'\')">';
          });
          html += '</div>';
        }
        html += '</div>';
      });
    }
    html += '</div>';
    result.innerHTML = html;
  } catch(e) { console.error(e); result.innerHTML = '<div style="color:var(--red);padding:20px">查詢異常</div>'; }
}

// ── 一鍵更換貨架位置 ──
async function bulkChangeShelf(memberCode, count) {
  var newShelf = prompt('將 ' + memberCode + ' 的 ' + count + ' 件在庫包裹全部移至新貨架：\n\n請輸入新貨架位置（例：A中、B下）');
  if(!newShelf || !newShelf.trim()) return;
  newShelf = newShelf.trim().toUpperCase();
  if(!confirm('確認將 ' + memberCode + ' 所有在庫包裹移至 📍 ' + newShelf + '？')) return;
  try {
    var { error } = await sb.from('packages').update({ shelf: newShelf }).eq('member_code', memberCode).in('status', ['arrived','checking','pointed','point_done','carried','wait_pickup','unclaimed']);
    if(error) { showToast('❌ 更新失敗：' + error.message, 'red'); return; }
    showToast('✅ ' + count + ' 件包裹已移至 📍 ' + newShelf, 'green');
    searchCustomerDB();
  } catch(e) { console.error(e); showToast('操作失敗', 'red'); }
}

// ── 自動清理：出貨超過 6 個月的照片 ──────────────
// 每天自動執行一次，從 Storage 刪除已出貨超過 180 天的包裹照片
async function cleanupOldPhotos() {
  if(!sb) { console.log('⏭️ 清理跳過：Supabase 未連線'); return; }

  // 每天只執行一次
  var lastRun = localStorage.getItem('photoCleanup_lastRun') || '';
  var today = new Date().toISOString().slice(0, 10);
  if(lastRun === today) { console.log('⏭️ 今天已執行過照片清理'); return; }

  console.log('🧹 開始清理出貨超過 6 個月的照片...');
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  var cutoffISO = cutoff.toISOString();
  var totalDeleted = 0;

  try {
    // ── 1. 清理 packages 表的入庫照片 ──
    var { data: oldPkgs, error: pkgErr } = await sb
      .from('packages')
      .select('id, tracking_no, photo_urls, shipped_at')
      .not('photo_urls', 'is', null)
      .lt('shipped_at', cutoffISO)
      .in('status', ['delivered', 'picked', 'shipping']);

    if(pkgErr) { console.error('查詢舊包裹失敗:', pkgErr); }

    var pkgsToClean = (oldPkgs || []).filter(function(p) {
      var urls = p.photo_urls;
      if(!urls) return false;
      if(typeof urls === 'string') { try { urls = JSON.parse(urls); } catch(e){ return false; } }
      return Array.isArray(urls) && urls.length > 0;
    });

    if(pkgsToClean.length > 0) {
      console.log('📦 找到 ' + pkgsToClean.length + ' 個需清理照片的舊包裹');

      for(var i = 0; i < pkgsToClean.length; i++) {
        var pkg = pkgsToClean[i];
        var urls = pkg.photo_urls;
        if(typeof urls === 'string') { try { urls = JSON.parse(urls); } catch(e){ continue; } }

        // 從 URL 解析 Storage 路徑並刪除
        var filePaths = [];
        urls.forEach(function(url) {
          if(typeof url !== 'string') return;
          var marker = '/storage/v1/object/public/package-photos/';
          var idx = url.indexOf(marker);
          if(idx !== -1) {
            filePaths.push(url.substring(idx + marker.length));
          }
        });

        if(filePaths.length > 0) {
          var { error: delErr } = await sb.storage.from('package-photos').remove(filePaths);
          if(delErr) {
            console.warn('⚠️ 刪除照片失敗 (' + pkg.tracking_no + '):', delErr.message);
          } else {
            totalDeleted += filePaths.length;
          }
        }

        // 清空 DB 中的 photo_urls
        await sb.from('packages').update({ photo_urls: null }).eq('id', pkg.id);
      }
    }

    // ── 2. 清理 tasks 表的包裝完成照片 ──
    var { data: oldTasks, error: taskErr } = await sb
      .from('tasks')
      .select('id, ship_photo, completed_at')
      .not('ship_photo', 'is', null)
      .neq('ship_photo', '')
      .lt('completed_at', cutoffISO)
      .in('status', ['completed', 'paid']);

    if(taskErr) { console.error('查詢舊任務失敗:', taskErr); }

    var tasksToClean = (oldTasks || []).filter(function(t) {
      return t.ship_photo && t.ship_photo.trim().length > 0;
    });

    if(tasksToClean.length > 0) {
      console.log('📋 找到 ' + tasksToClean.length + ' 個需清理照片的舊任務');

      for(var j = 0; j < tasksToClean.length; j++) {
        var task = tasksToClean[j];
        var marker2 = '/storage/v1/object/public/package-photos/';
        var idx2 = task.ship_photo.indexOf(marker2);
        if(idx2 !== -1) {
          var path = task.ship_photo.substring(idx2 + marker2.length);
          var { error: delErr2 } = await sb.storage.from('package-photos').remove([path]);
          if(delErr2) {
            console.warn('⚠️ 刪除包裝照片失敗 (task ' + task.id + '):', delErr2.message);
          } else {
            totalDeleted++;
          }
        }
        // 清空 DB 中的 ship_photo
        await sb.from('tasks').update({ ship_photo: null }).eq('id', task.id);
      }
    }

    // 記錄今天已執行
    localStorage.setItem('photoCleanup_lastRun', today);
    if(totalDeleted > 0) {
      console.log('✅ 照片清理完成：共刪除 ' + totalDeleted + ' 張照片（' + pkgsToClean.length + ' 個包裹 + ' + tasksToClean.length + ' 個任務）');
    } else {
      console.log('✅ 照片清理完成：目前沒有需要清理的舊照片');
    }
  } catch(e) {
    console.error('照片清理異常:', e);
  }
}

// 員工端啟動後 15 秒自動執行清理（不影響正常操作）
setTimeout(function() {
  if(sb) cleanupOldPhotos();
}, 15000);

