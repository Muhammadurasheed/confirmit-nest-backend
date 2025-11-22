const { 
  Client, 
  TokenCreateTransaction, 
  TokenType, 
  TokenSupplyType,
  PrivateKey,
  AccountId
} = require("@hashgraph/sdk");
require('dotenv').config();

async function createNFTToken() {
  console.log("🚀 Creating Hedera NFT Token for ConfirmIT...\n");

  // Initialize Hedera client
  const client = Client.forTestnet();
  const operatorId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID);
  const operatorKey = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
  
  client.setOperator(operatorId, operatorKey);

  console.log(`📋 Using Account: ${operatorId.toString()}`);
  console.log(`📋 Network: Testnet\n`);

  try {
    // Create the NFT token with supply key
    const transaction = new TokenCreateTransaction()
      .setTokenName("ConfirmIT Trust ID")
      .setTokenSymbol("CTID")
      .setTokenType(TokenType.NonFungibleUnique)
      .setDecimals(0)
      .setInitialSupply(0)
      .setTreasuryAccountId(operatorId)
      .setSupplyKey(operatorKey) // ✅ THIS IS THE KEY FIX!
      .setAdminKey(operatorKey)  // Optional: Allows token management
      .setMaxTransactionFee(20); // 20 HBAR max fee

    console.log("⏳ Submitting token creation transaction...");
    
    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const tokenId = receipt.tokenId;

    console.log("\n✅ SUCCESS! Token created:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`🎫 Token ID: ${tokenId.toString()}`);
    console.log(`🔍 Explorer: https://hashscan.io/testnet/token/${tokenId.toString()}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    console.log("📝 NEXT STEPS:");
    console.log(`1. Copy this Token ID: ${tokenId.toString()}`);
    console.log(`2. Update backend/.env:`);
    console.log(`   HEDERA_TOKEN_ID=${tokenId.toString()}`);
    console.log(`3. Restart backend server`);
    console.log(`4. Test NFT minting by approving a business!\n`);

    client.close();
    return tokenId.toString();

  } catch (error) {
    console.error("\n❌ ERROR creating token:", error.message);
    console.error("Full error:", error);
    client.close();
    process.exit(1);
  }
}

// Run the script
createNFTToken();
