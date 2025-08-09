import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';

interface ProfileData {
  name?: string;
  contact?: string[];
  facts?: string[];
  projects?: Record<string, any>;
  languages?: Array<{
    name: string;
    proficiency: string;
    context?: string;
  }>;
  certifications?: Record<string, any>;
  superior_education?: Record<string, any>;
  professional_experience?: Record<string, any>;
  academical_research?: Record<string, any>;
  memberships?: Record<string, any>;
  technical_skills?: {
    operating_systems?: string[];
    programming_languages?: string[];
    areas_of_expertise?: string[];
    tools_and_technologies?: string[];
  };
  github_stats?: Record<string, any>;
}

class PDFDataExtractor {
  private profilePath: string;
  private pdfPath: string;

  constructor() {
    this.profilePath = path.join(__dirname, '..', 'data', 'profile.json');
    this.pdfPath = path.join(__dirname, '..', 'data', 'profile.pdf');
  }

  async extractTextFromPDF(): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(this.pdfPath);
      const data = await pdf(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('Error reading PDF:', error);
      throw error;
    }
  }

  parseExtractedText(text: string): Partial<ProfileData> {
    const extractedData: Partial<ProfileData> = {};
    const textLower = text.toLowerCase();
    
    const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/g;
    const emails = text.match(emailRegex) || [];
    
    const phoneRegex = /(?:\+?[1-9]\d{1,14}|\(\d{3}\)\s?\d{3}-?\d{4}|\d{3}[-.]?\d{3}[-.]?\d{4})/g;
    const potentialPhones = text.match(phoneRegex) || [];
    const phones = potentialPhones.filter(num => {
      const digits = num.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15 && 
             !(/^(19|20)\d{2}$/.test(digits)) && 
             !(digits.length === 2 || digits.length === 4);
    });
    
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    
    const linkedinRegex = /linkedin\.com\/in\/[\w-]+/g;
    const linkedinProfiles = text.match(linkedinRegex) || [];
    
    const githubRegex = /github\.com\/[\w-]+/g;
    const githubProfiles = text.match(githubRegex) || [];

    const contactInfo = [
      ...emails,
      ...phones,
      ...urls,
      ...linkedinProfiles.map(profile => `https://${profile}`),
      ...githubProfiles.map(profile => `https://${profile}`)
    ].filter((item, index, arr) => arr.indexOf(item) === index);

    if (contactInfo.length > 0) {
      extractedData.contact = contactInfo;
    }

    const educationData: Record<string, any> = {};
    
    if (textLower.includes('engenharia da computação') && textLower.includes('universidade de pernambuco')) {
      educationData['computer_engineering_upe'] = {
        degree: "Bachelor of Engineering",
        field: "Computer Engineering", 
        institution: "Universidade de Pernambuco (UPE)",
        location: "Recife, Pernambuco, Brasil",
        start_date: "April 2024",
        end_date: "December 2028",
        status: "in_progress",
        extracted_from_pdf: true
      };
    }

    if (Object.keys(educationData).length > 0) {
      extractedData.superior_education = educationData;
    }

    const certifications: Record<string, any> = {};
    const lines = text.split('\n');
    
    const certificationKeywords = [
      'certification', 'certificate', 'certified', 'course', 'training',
      'certificação', 'certificado', 'curso', 'treinamento'
    ];
    
    const certificationProviders = [
      'aws', 'microsoft', 'google', 'oracle', 'cisco', 'comptia',
      'coursera', 'udemy', 'edx', 'linkedin learning', 'pluralsight',
      'figma', 'adobe', 'salesforce', 'vmware', 'red hat'
    ];

    const unwantedPatterns = [
      /^page\s+\d+\s+of\s+\d+$/i,
      /^certifications?$/i,
      /^certificações?$/i,
      /^\d+\s*(months?|meses?)$/i,
      /^languages?$/i,
      /^idiomas?$/i,
      /^contato$/i,
      /^principais\s+competências$/i
    ];

    let inCertSection = false;
    
    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase().trim();
      const originalLine = line.trim();
      
      if (lowerLine.length < 3) return;
      
      if (lowerLine.includes('certification') || lowerLine.includes('certificação')) {
        inCertSection = true;
        return;
      }
      
      if (inCertSection && (
        lowerLine.includes('experience') || lowerLine.includes('experiência') ||
        lowerLine.includes('education') || lowerLine.includes('formação') ||
        lowerLine.includes('gabriel borges') ||
        /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(originalLine) // Name pattern
      )) {
        inCertSection = false;
      }
      
      if (unwantedPatterns.some(pattern => pattern.test(originalLine))) return;
      
      const hasCertKeyword = certificationKeywords.some(keyword => 
        lowerLine.includes(keyword)
      );
      
      const hasProvider = certificationProviders.some(provider => 
        lowerLine.includes(provider)
      );
      
      const coursePattern = /[a-z]+\s*\d+/i;
      const hasCoursePattern = coursePattern.test(lowerLine);
      
      const titleCasePattern = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]*)*.*$/;
      const isTitleCase = titleCasePattern.test(originalLine);
      
      const contextualMatch = inCertSection && originalLine.length > 3 && 
                              !originalLine.match(/^\d+$/) && // Not just numbers
                              !originalLine.match(/^[a-z\s]+$/); // Not all lowercase
      
      if (hasCertKeyword || hasProvider || (hasCoursePattern && isTitleCase) || contextualMatch) {
        let certName = originalLine;
        
        if (index + 1 < lines.length) {
          const nextLine = lines[index + 1].trim();
          if (nextLine.length > 0 && nextLine.length < 15 && 
              (nextLine.match(/^[a-z]/) || nextLine === 'Science')) {
            certName = `${certName} ${nextLine}`;
            lines[index + 1] = ''; // Mark as processed
          }
        }
        
        certName = certName.replace(/^(certificat(e|ion|ed)|course|training):\s*/i, '');
        
        const isGeneric = certificationKeywords.includes(certName.toLowerCase()) ||
                         certName.toLowerCase() === 'certifications' ||
                         certName.toLowerCase() === 'certificações' ||
                         certName.toLowerCase() === 'science'; // Skip standalone "Science"
        
        if (certName.length > 3 && !isGeneric) {
          const certKey = certName.toLowerCase().replace(/[^a-z0-9]/g, '_');
          
          if (!certifications[certKey]) {
            certifications[certKey] = {
              name: certName,
              type: "course_completion",
              extracted_from_pdf: true
            };
          }
        }
      }
    });

    const certSectionRegex = /certifica[tç][õo]es?[\s:]*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*\n|\n[A-Z]|$)/gi;
    const certSections = text.match(certSectionRegex);
    
    if (certSections) {
      certSections.forEach(section => {
        const sectionLines = section.split('\n').slice(1); // Skip the header
        sectionLines.forEach(line => {
          const cleanLine = line.trim();
          if (cleanLine.length > 3) {
            const certKey = cleanLine.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (!certifications[certKey]) {
              certifications[certKey] = {
                name: cleanLine,
                type: "course_completion",
                extracted_from_pdf: true
              };
            }
          }
        });
      });
    }

    if (Object.keys(certifications).length > 0) {
      extractedData.certifications = certifications;
    }

    const programmingLanguages = [
      'javascript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'rust',
      'typescript', 'php', 'swift', 'kotlin', 'scala', 'r', 'matlab',
      'html', 'css', 'sql', 'bash', 'shell'
    ];

    const foundLanguages: string[] = [];
    
    programmingLanguages.forEach(lang => {
      if (textLower.includes(lang)) {
        foundLanguages.push(lang.charAt(0).toUpperCase() + lang.slice(1));
      }
    });

    if (foundLanguages.length > 0) {
      extractedData.languages = foundLanguages.map(lang => ({
        name: lang,
        proficiency: 'intermediate',
        context: 'Extracted from PDF'
      }));
    }

    const skillsKeywords = [
      'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'linux', 'windows',
      'git', 'jenkins', 'terraform', 'ansible', 'mongodb', 'postgresql',
      'mysql', 'redis', 'elasticsearch', 'nginx', 'apache'
    ];

    const foundSkills: string[] = [];
    skillsKeywords.forEach(skill => {
      if (textLower.includes(skill)) {
        foundSkills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
      }
    });

    if (foundSkills.length > 0) {
      extractedData.technical_skills = {
        tools_and_technologies: foundSkills
      };
    }

    return extractedData;
  }

  async loadCurrentProfile(): Promise<ProfileData> {
    try {
      const profileContent = fs.readFileSync(this.profilePath, 'utf-8');
      return JSON.parse(profileContent);
    } catch (error) {
      console.error('Error loading current profile:', error);
      return {};
    }
  }

  mergeProfileData(currentProfile: ProfileData, extractedData: Partial<ProfileData>): ProfileData {
    const mergedProfile = { ...currentProfile };

    if (extractedData.contact) {
      const existingContacts = mergedProfile.contact || [];
      const newContacts = extractedData.contact.filter(
        contact => !existingContacts.includes(contact)
      );
      mergedProfile.contact = [...existingContacts, ...newContacts];
    }

    if (extractedData.languages) {
      const existingLanguages = mergedProfile.languages || [];
      const existingLanguageNames = existingLanguages.map(lang => lang.name.toLowerCase());
      
      const newLanguages = extractedData.languages.filter(
        lang => !existingLanguageNames.includes(lang.name.toLowerCase())
      );
      
      mergedProfile.languages = [...existingLanguages, ...newLanguages];
    }

    if (extractedData.superior_education) {
      mergedProfile.superior_education = {
        ...mergedProfile.superior_education,
        ...extractedData.superior_education
      };
    }

    if (extractedData.certifications) {
      mergedProfile.certifications = {
        ...mergedProfile.certifications,
        ...extractedData.certifications
      };
    }

    if (extractedData.technical_skills) {
      const existingSkills = mergedProfile.technical_skills || {};
      mergedProfile.technical_skills = {
        ...existingSkills,
        ...extractedData.technical_skills
      };
    }

    return mergedProfile;
  }

  async saveProfile(profile: ProfileData): Promise<void> {
    try {
      const timestamp = Date.now();
      const backupPath = `${this.profilePath}.backup.${timestamp}`;
      fs.copyFileSync(this.profilePath, backupPath);
      console.log(`Backup created: ${backupPath}`);

      fs.writeFileSync(this.profilePath, JSON.stringify(profile, null, 2));
      console.log('Profile updated successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      throw error;
    }
  }

  async extractAndMerge(): Promise<void> {
    try {
      console.log('Starting PDF data extraction...');
      
      if (!fs.existsSync(this.pdfPath)) {
        throw new Error(`PDF file not found: ${this.pdfPath}`);
      }

      console.log('Extracting text from PDF...');
      const extractedText = await this.extractTextFromPDF();
      console.log('PDF text extracted successfully');

      console.log('Parsing extracted data...');
      const extractedData = this.parseExtractedText(extractedText);
      console.log('Extracted data:', extractedData);

      console.log('Loading current profile...');
      const currentProfile = await this.loadCurrentProfile();

      console.log('Merging profile data...');
      const mergedProfile = this.mergeProfileData(currentProfile, extractedData);

      console.log('Saving updated profile...');
      await this.saveProfile(mergedProfile);

      console.log('PDF data extraction and merge completed successfully!');
    } catch (error) {
      console.error('Error during extraction and merge:', error);
      throw error;
    }
  }

  async previewExtraction(): Promise<void> {
    try {
      console.log('Previewing PDF data extraction...');
      
      if (!fs.existsSync(this.pdfPath)) {
        throw new Error(`PDF file not found: ${this.pdfPath}`);
      }

      const extractedText = await this.extractTextFromPDF();
      console.log('=== EXTRACTED TEXT ===');
      console.log(extractedText);
      console.log('\n=== PARSED DATA ===');
      
      const extractedData = this.parseExtractedText(extractedText);
      console.log(JSON.stringify(extractedData, null, 2));
    } catch (error) {
      console.error('Error during preview:', error);
      throw error;
    }
  }
}

async function main() {
  const extractor = new PDFDataExtractor();
  const args = process.argv.slice(2);

  if (args.includes('--preview')) {
    await extractor.previewExtraction();
  } else {
    await extractor.extractAndMerge();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default PDFDataExtractor;
