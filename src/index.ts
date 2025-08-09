import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

interface ProfileData {
  contact: string[];
  facts: string[];
  projects: Record<string, any>;
  languages: Array<{ name: string; proficiency: string; context: string }>;
  certifications: Record<string, any>;
  superior_education: Record<string, any>;
  professional_experience: Record<string, any>;
  academical_research: Record<string, any>;
  memberships?: Record<string, any>;
  technical_skills?: {
    operating_systems: string[];
    programming_languages: string[];
    areas_of_expertise: string[];
  };
}

class CVGenerator {
  private profileData: ProfileData;
  private templatePath: string;
  private outputDir: string;

  constructor() {
    this.templatePath = path.join(__dirname, 'assets', 'templates', 'base-cv.tex');
    this.outputDir = path.join(__dirname, '..', 'output');
    this.profileData = this.loadProfileData();
    
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private loadProfileData(): ProfileData {
    const profilePath = path.join(__dirname, '..', 'data', 'profile.json');
    const profileJson = fs.readFileSync(profilePath, 'utf-8');
    return JSON.parse(profileJson);
  }

  private async callGitHubModels(prompt: string): Promise<string> {
    const apiKey = process.env.GITHUB_TOKEN;
    if (!apiKey) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are an expert LaTeX CV generator. Generate professional, clean, and ATS-friendly CV content based on the provided profile data. Follow the template structure and use proper LaTeX formatting.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'gpt-4o',
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub Models API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private createPrompt(): string {
    return `
Based on the following profile data, generate a complete LaTeX CV using the template structure provided. 
Make it professional, ATS-friendly, and tailored for a tech professional.

PROFILE DATA:
${JSON.stringify(this.profileData, null, 2)}

INSTRUCTIONS:
1. Use the template structure from base-cv.tex, follow it structure, do not change the core
2. Fill in all sections with relevant information from the profile data
3. For the header, extract name from the json
4. Create a professional summary based on the facts and experience
5. Map programming languages to technical skills section
6. Convert professional_experience to experience entries
7. Convert projects to project entries with proper descriptions
8. Add academical_research as relevant experience or separate section
9. Include memberships (IEEE, etc.) appropriately
10. Keep the LaTeX formatting clean and professional
11. Use Brazilian Portuguese for section headers but technical terms in English
12. Ensure all URLs and links are properly formatted

IMPORTANT: Return ONLY the raw LaTeX code, without any markdown formatting, code blocks, or explanations. 
The response should start directly with \\documentclass and end with \\end{document}.

Generate the complete LaTeX document, ready to compile.
`;
  }

  private async generateLatexContent(): Promise<string> {
    const prompt = this.createPrompt();
    console.log('🤖 Calling GitHub Models LLM to generate CV content...');
    
    try {
      const generatedContent = await this.callGitHubModels(prompt);
      return this.cleanLatexContent(generatedContent);
    } catch (error) {
      console.error('Error calling GitHub Models:', error);
      throw error;
    }
  }

  private cleanLatexContent(content: string): string {
    let cleanContent = content.trim();
    
    if (cleanContent.startsWith('```latex')) {
      cleanContent = cleanContent.substring(8);
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.substring(3);
    }
    
    if (cleanContent.endsWith('```')) {
      cleanContent = cleanContent.substring(0, cleanContent.length - 3);
    }
    
    return cleanContent.trim();
  }

  private async compilePDF(texFilePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('📄 Compiling LaTeX to PDF...');
      
      const pdflatex = spawn('pdflatex', [
        '-interaction=nonstopmode',
        '-output-directory', this.outputDir,
        texFilePath
      ], {
        cwd: this.outputDir
      });

      let stdout = '';
      let stderr = '';

      pdflatex.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pdflatex.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pdflatex.on('close', (code) => {
        if (code === 0 || stdout.includes('Output written on')) {
          console.log('🔄 Running second pass for proper formatting...');
          const secondPass = spawn('pdflatex', [
            '-interaction=nonstopmode',
            '-output-directory', this.outputDir,
            texFilePath
          ], {
            cwd: this.outputDir
          });

          secondPass.on('close', (secondCode) => {
            if (secondCode === 0 || stdout.includes('Output written on')) {
              console.log('✅ PDF compiled successfully!');
              resolve();
            } else {
              console.log('⚠️  Second pass failed, but first pass succeeded');
              resolve();
          });

          secondPass.on('error', () => {
            console.log('⚠️  Second pass failed, but first pass succeeded');
            resolve();
          });
        } else {
          console.error('❌ LaTeX compilation failed');
          if (stdout) console.error('STDOUT:', stdout.substring(0, 1000) + '...');
          if (stderr) console.error('STDERR:', stderr);
          reject(new Error(`pdflatex exited with code ${code}`));
        }
      });

      pdflatex.on('error', (err) => {
        console.error('❌ Failed to start pdflatex:', err.message);
        reject(err);
      });
    });
  }

  public async generateCV(): Promise<void> {
    try {
      console.log('🚀 Starting CV generation process...');
      
      const latexContent = await this.generateLatexContent();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const texFileName = `cv-${timestamp}.tex`;
      const texFilePath = path.join(this.outputDir, texFileName);
      
      fs.writeFileSync(texFilePath, latexContent);
      console.log(`📝 LaTeX file saved: ${texFilePath}`);
      
      await this.compilePDF(texFilePath);
      
      const pdfFileName = `cv-${timestamp}.pdf`;
      const pdfFilePath = path.join(this.outputDir, pdfFileName);
      
      if (fs.existsSync(pdfFilePath)) {
        console.log(`🎉 CV generated successfully: ${pdfFilePath}`);
      } else {
        console.log('⚠️  LaTeX compiled but PDF not found at expected location');
      }
      
    } catch (error) {
      console.error('❌ Error generating CV:', error);
      throw error;
    }
  }
}

async function main() {
  try {
    const generator = new CVGenerator();
    await generator.generateCV();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

function checkRequirements() {
  console.log('🔍 Checking requirements...');
  
  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN environment variable is required');
    console.log('Please set your GitHub token with access to GitHub Models');
    process.exit(1);
  }
  
  console.log('✅ Environment variables OK');
}

if (require.main === module) {
  checkRequirements();
  main();
}

export { CVGenerator };