import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { HfInference } from '@huggingface/inference';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Hugging Face API setup
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ProtoMind Backend is running' });
});

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, model } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`[${new Date().toISOString()}] Model: ${model}, Message: ${message}`);

    let response: string;

    // モデル選択によって処理を分岐
    switch (model) {
      case 'V1': // CM-1000: 高機能会話モデル
        response = await generateResponseV1(message);
        break;
      case 'V1c': // CM-600: 軽量会話モデル
        response = await generateResponseV1c(message);
        break;
      default:
        response = await generateResponseV1(message);
    }

    res.json({ 
      response, 
      model,
      timestamp: new Date().toISOString() 
    });

  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// V1 (CM-1000): GPT-2ベースの高機能モデル
async function generateResponseV1(message: string): Promise<string> {
  try {
    const result = await hf.textGeneration({
      model: 'gpt2',
      inputs: message,
      parameters: {
        max_new_tokens: 100,
        temperature: 0.8,
        top_p: 0.9,
        repetition_penalty: 1.2,
      }
    });

    return result.generated_text.trim();
  } catch (error) {
    console.error('V1 generation error:', error);
    return 'すみません、応答の生成中にエラーが発生しました。(V1)';
  }
}

// V1c (CM-600): 軽量版（より短い応答）
async function generateResponseV1c(message: string): Promise<string> {
  try {
    const result = await hf.textGeneration({
      model: 'gpt2',
      inputs: message,
      parameters: {
        max_new_tokens: 50, // V1より短く
        temperature: 0.7,
        top_p: 0.85,
      }
    });

    return result.generated_text.trim();
  } catch (error) {
    console.error('V1c generation error:', error);
    return 'すみません、応答の生成中にエラーが発生しました。(V1c)';
  }
}

app.listen(PORT, () => {
  console.log(`🚀 ProtoMind Backend running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});