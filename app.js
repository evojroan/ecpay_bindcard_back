//npm install express crypto cors axios http ws
import express from "express";
import crypto from "crypto";
import cors from "cors";
import axios from "axios";

const app = express();
//const port = 3000; //部署到 Vercel 已不需要這行
const AESAlgorithm = "aes-128-cbc";
const frontendurl =
  "ecpay-bindcard-front.vercel.app";

app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(cors());

const MID = {
  3002607: {HashKey: "pwFHCqoQZGmho4w6", HashIV: "EkRm7iFT261dpevs"},
  3003008: {HashKey: "FCnGLNS7P3xQ2q3E", HashIV: "awL5GRWRhyaybq13"}
};

//將 Data 加密
function AESEncrypt(inputParams, HashKey, HashIV) {
  let URLEncoded = encodeURIComponent(JSON.stringify(inputParams));
  const cipher = crypto.createCipheriv(AESAlgorithm, HashKey, HashIV);
  let EncryptedData = cipher.update(URLEncoded, "utf8", "base64");
  EncryptedData += cipher.final("base64");
  return EncryptedData;
}

//將綠界回傳的 Data 解密
function AESDecrypt(inputParams, HashKey, HashIV) {
  const decipher = crypto.createDecipheriv(AESAlgorithm, HashKey, HashIV);
  let DecryptedData = decipher.update(inputParams, "base64", "utf8");
  DecryptedData += decipher.final("utf8");
  return JSON.parse(decodeURIComponent(DecryptedData));
}

//呼叫  ECPay API：付款 GetTokenbyTrade
async function RequestECPayAPIs(action, payload) {
  if (action == "GetTokenbyBindingCard") {
    try {
      const response = await axios.post(
        "https://ecpg-stage.ecpay.com.tw/Merchant/GetTokenbyBindingCard",
        payload
      );
      console.log("GetTokenbyBindingCard: ", response.data);
      return response.data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  } else if (action == "CreateBindCard") {
    try {
      const response = await axios.post(
        "https://ecpg-stage.ecpay.com.tw/Merchant/CreateBindCard",
        payload
      );
      console.log("CreateBindCard 結果：", response.data);
      return response.data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
}

// 加解密：取得廠商驗證碼 GetTokenbyTrade：接收前端送來的加密前 Data，加密後再呼叫 API (async function RequestECPayAPIs)
app.post("/GetTokenbyBindingCard", async (req, res) => {
  try {
    const {MerchantID, RqHeader, Data} = req.body;
    const encryptedData = AESEncrypt(
      Data,
      MID[MerchantID].HashKey,
      MID[MerchantID].HashIV
    );
    const GetTokenbyBindingCardPayload = {
      MerchantID,
      RqHeader,
      Data: encryptedData
    };
    const result = await RequestECPayAPIs(
      "GetTokenbyBindingCard",
      GetTokenbyBindingCardPayload
    );
    const decryptedData = AESDecrypt(
      result.Data,
      MID[MerchantID].HashKey,
      MID[MerchantID].HashIV
    );
    res.json(decryptedData.Token);
  } catch (error) {
    console.error("Error in GetTokenbyBindingCard:", error);
    res.status(500).json({error: "內部伺服器錯誤"});
  }
});

// 加解密：建立付款 CreatePayment：接收前端送來的加密前 Data，加密後再呼叫 API (async function RequestECPayAPIs)
app.post("/CreateBindCard", async (req, res) => {
  try {
    const {MerchantID, RqHeader, Data} = req.body;
    const encryptedData = AESEncrypt(
      Data,
      MID[MerchantID].HashKey,
      MID[MerchantID].HashIV
    );
    const CreateBindCardPayload = {
      MerchantID,
      RqHeader,
      Data: encryptedData
    };
    const result = await RequestECPayAPIs(
      "CreateBindCard",
      CreateBindCardPayload
    );
    const decryptedData = AESDecrypt(
      result.Data,
      MID[MerchantID].HashKey,
      MID[MerchantID].HashIV
    );

    res.json(decryptedData);
  } catch (error) {
    console.error("Error in CreateBindCard:", error);
    res.status(500).json({error: "內部伺服器錯誤"});
  }
});

//解密：接收 OrderResultURL 傳來的加密付款結果通知，解密後再回傳給 OrderResultURL
const OrderResult = {};
app.post("/OrderResultURL", async (req, res) => {
  try {
    const {MerchantID, Data} = JSON.parse(req.body.ResultData);
    const decryptedData = AESDecrypt(
      Data,
      MID[MerchantID].HashKey,
      MID[MerchantID].HashIV
    );
    console.log(decryptedData);
    const MerchantTradeNo = decryptedData.OrderInfo.MerchantTradeNo;
    console.log("MerchantTradeNo=", MerchantTradeNo);
    OrderResult[MerchantTradeNo] = decryptedData;

    // 重定向到前端頁面，附帶訂單編號
    res.redirect(
      `${frontendurl}/OrderResultURL?MerchantTradeNo=${MerchantTradeNo}`
    );
  } catch (error) {
    console.error("Error in CreateBindCard:", error);
    res.status(500).json({error: "OrderResultURL 錯誤"});
  }
});

// 提供給前端獲取付款結果的 API
app.get("/api/getOrderResult", (req, res) => {
  const MerchantTradeNo = req.query.MerchantTradeNo;
  const OderResultPayload = OrderResult[MerchantTradeNo];

  if (OderResultPayload) {
    res.json(OderResultPayload);
  } else {
    res.status(404).json({error: "找不到付款結果"});
  }
});

//部署到 Vercel 取消這段
// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });

// 部署到 Vercel 需要增加這一行
export default app;
