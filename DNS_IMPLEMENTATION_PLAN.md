# DNS Implementation Plan - West Coast College Admin

## 📅 Date: February 11, 2026

---

## 🎯 **Implementation Priority: HIGH**

### **Email Security Records to Implement**

#### **1. SPF Record (HIGH PRIORITY)**
- **Status**: Not Configured
- **Risk**: Email spoofing vulnerability
- **Impact**: Attackers can send emails appearing to come from your domain
- **Priority**: **HIGH**

#### **2. DMARC Record (HIGH PRIORITY)**
- **Status**: Not Configured  
- **Risk**: No email authentication policy
- **Impact**: No protection against email spoofing and phishing
- **Priority**: **HIGH**

#### **3. MX Records (MEDIUM PRIORITY)**
- **Status**: Not Configured
- **Risk**: Email delivery issues
- **Impact**: No email functionality for the domain
- **Priority**: **MEDIUM**

#### **4. CAA Record (MEDIUM PRIORITY)**
- **Status**: Not Configured
- **Risk**: Unrestricted certificate issuance
- **Impact**: Any CA can issue certificates for your domain
- **Priority**: **MEDIUM**

---

## 🔧 **Step-by-Step Implementation**

### **Step 1: Choose Email Provider**

#### **Option A: Google Workspace (Recommended for Education)**
1. Go to [Google Workspace Admin Console](https://admin.google.com/)
2. Navigate to **Apps > Google Workspace > Gmail > Routing**
3. Add your domain if not already added
4. Configure MX records (Google will do this automatically)
5. Set up SPF record in Google Admin Console

#### **Option B: Microsoft 365**
1. Go to [Microsoft 365 Admin Center](https://admin.microsoft.com/)
2. Navigate to **Settings > Domains**
3. Add your domain
4. Configure MX records (Microsoft will do this automatically)
5. Set up SPF record in Microsoft 365 Admin Center

#### **Option C: Custom Mail Server**
1. Configure your mail server (Postfix recommended)
2. Set up proper DNS MX records
3. Create SPF record including your mail server
4. Configure DKIM signing
5. Set up DMARC record

### **Step 2: Add DNS Records**

#### **For GoDaddy:**
1. Log into GoDaddy DNS Management
2. Navigate to **DNS Management**
3. Add TXT records for SPF and DMARC
4. Add MX records if using custom mail server
5. Add CAA record for Let's Encrypt

#### **For Cloudflare:**
1. Log into Cloudflare Dashboard
2. Navigate to **DNS > DNS Management**
3. Add TXT records for SPF and DMARC
4. Add MX records if needed
5. Add CAA record for Let's Encrypt

#### **For Namecheap:**
1. Log into Namecheap Domain Manager
2. Navigate to **Domain List > Manage**
3. Select **DNS Settings**
4. Add TXT records for SPF and DMARC
5. Add MX records if needed
6. Add CAA record for Let's Encrypt

### **Step 3: Test Implementation**

#### **Test SPF Record:**
```bash
# Test SPF record
nslookup -type=TXT westcoastcollege.edu spf

# Alternative test
dig txt westcoastcollege.edu spf
```

#### **Test DMARC Record:**
```bash
# Test DMARC record
nslookup -type=TXT _dmarc.westcoastcollege.edu

# Alternative test
dig txt _dmarc.westcoastcollege.edu dmarc
```

#### **Test MX Records:**
```bash
# Test MX records
nslookup -type=MX westcoastcollege.edu

# Alternative test
dig mx westcostatecollege.edu
```

#### **Test CAA Record:**
```bash
# Test CAA record
nslookup -type=TXT westcoastcollege.edu caa

# Alternative test
dig caa westcoastcollege.edu
```

### **Step 4: Verify Email Security**

#### **Use Online Tools:**
- [MXToolbox SPF Lookup](https://mxtoolbox.com/SPFLookup.aspx)
- [MXToolbox DMARC Lookup](https://mxtoolbox.com/DMARCLookup.aspx)
- [Google Admin Console Toolbox](https://toolbox.googleapps.com/)

#### **Send Test Email:**
```bash
# Send test email to check SPF
echo "Test email for SPF validation" | mail -s "SPF Test" admin@westcoastcollege.edu

# Check email headers for authentication
```

---

## 📋 **DNS Records to Add**

### **Complete DNS Configuration (Google Workspace)**

```dns
; SPF Record
v=spf1 include:_spf.google.com ~all

; DMARC Record (Start)
v=DMARC1; p=none; rua=mailto:dmarc@westcoastcollege.edu

; MX Records
westcoastcollege.edu. 10 MX 1 aspmx.l.google.com.
westcocalege.edu. 20 MX 5 alt1.aspmx.l.google.com.
westcoastcollege.edu. 30 MX 10 alt2.aspmx.l.google.com.
westcoastcollege.edu. 40 MX 10 alt3.aspmx.l.google.com.
westcoastcollege.edu. 5 50 MX 20 alt4.aspmx.l.google.com.

; CAA Record
westcoastcollege.edu. 0 issue "letsencrypt.org"
```

### **Complete DNS Configuration (Microsoft 365)**

```dns
; SPF Record
v=spf1 include:spf.protection.outlook.com ~all

; DMARC Record (Start)
v=DMARC1; p=none; rua=mailto:dmarc@westcoastcollege.edu

; MX Record
westcoastcollege.edu. 0 MX 10 westcoastcollege-edu.mail.protection.outlook.com.

; CAA Record
westcoastcollege.edu. 0 issue "letsencrypt.org"
```

---

## 🔍 **Testing and Validation**

### **Online Testing Tools**
- **SPF**: [MXToolbox SPF Lookup](https://mxtoolbox.com/SPFLookup.aspx)
- **DMARC**: [MXToolbox DMARC Lookup](https://mxtoolbox.com/DMARCLookup.aspx)
- **CAA**: [MXToolbox CAA Lookup](https://mxtoolbox.com/CAALookup.aspx)
- **MX**: [MXToolbox MX Lookup](https://mxtoolbox.com/MXLookup.aspx)

### **Command Line Testing**
```bash
# Test all records
nslookup -type=TXT westcoastcollege.edu
nslookup -type=MX westcoastcollege.edu
```

### **Email Testing**
```bash
# Test email delivery
echo "Test email for security validation" | mail -s "Security Test" admin@westcoastcollege.edu

# Check for authentication headers
```

---

## ⚠️ **Important Notes**

### **DNS Propagation**
- **Time**: 5 minutes to 48 hours for full propagation
- **TTL**: Default TTL may affect propagation speed
- **Validation**: Test after implementation

### **DMARC Reporting**
- **Start with `p=none` (monitoring mode)
- **Monitor** reports for 1-2 weeks
- **Strengthen** to `p=quarantine` or `p=reject` after validation

### **SPF Alignment**
- **Include**: Use include statements for providers
- **Limit**: Stay under 10 DNS lookups
- **Testing**: Test with various email services

### **CAA Records**
- **Let's Encrypt**: Most common choice for educational institutions
- **Multiple CAs**: Consider for redundancy
- **Security**: Prevents unauthorized certificate issuance

---

## 🎯 **Expected Results**

### **Security Score Improvement**
- **Before**: 0/40 (No email security)
- **After**: 32/40 (Good email security)
- **Improvement**: 80% increase in email security

### **Scanner Results**
- **SPF Record**: ✅ PASS
- **DMARC Record**: ✅ PASS (monitoring mode)
- **MX Records**: ✅ PASS (properly configured)
- **CAA Record**: ✅ PASS (Let's Encrypt only)

### **Security Benefits**
- ✅ **Email Spoofing Prevention**: SPF blocks unauthorized senders
- ✅ **Email Authentication**: DMARC verifies message authenticity
- **Email Deliverability**: Proper MX configuration
- **Certificate Control**: CAA restricts CA issuance

---

## 📞 **Support Resources**

### **Documentation**
- [SPF Project](https://www.open-spf.org/)
- [DMARC.org](https://dmarc.org/)
- [CAA Record Guide](https://sslmate.com/caa-record-guide/)

### **Email Providers**
- [Google Workspace](https://workspace.google.com/)
- [Microsoft 365](https://www.microsoft.com/en-us/microsoft-365/)
- [Google Workspace Admin Help](https://support.google.com/a/answer/1069644)

### **DNS Providers**
- [GoDaddy](https://www.godaddy.com/)
- [Cloudflare](https://www.cloudflare.com/)
- [Namecheap](https://www.namecheap.com/)
- [Network Solutions](https://www.networksolutions.com/)

---

## 📝 **Next Steps**

1. **Choose your email provider** (Google Workspace recommended)
2. **Log into your DNS provider**
3. **Add the DNS records** using the templates above
4. **Test the implementation** with provided commands
5. **Monitor DMARC reports** for 1-2 weeks
6. **Strengthen DMARC policy** after confirming delivery

---

*This implementation plan provides everything needed to secure your domain's email infrastructure against common email-based attacks and follows industry best practices for email security.*
