import * as fs from 'fs';
import * as path from 'path';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  languages_url: string;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  size: number;
  topics: string[];
  visibility: string;
  default_branch: string;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  license: {
    key: string;
    name: string;
    spdx_id: string;
  } | null;
}

interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  bio: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

interface LanguageStats {
  [language: string]: number;
}

interface ProfileData {
  name?: string;
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
  github_stats?: {
    total_repos: number;
    total_stars: number;
    total_forks: number;
    followers: number;
    following: number;
    account_created: string;
    most_used_languages: string[];
    notable_repos: Array<{
      name: string;
      description: string;
      language: string;
      stars: number;
      forks: number;
      url: string;
      topics: string[];
    }>;
  };
}

class GitHubDataCollector {
  private apiToken: string;
  private username: string;
  private baseUrl = 'https://api.github.com';
  private profilePath: string;

  constructor() {
    this.apiToken = process.env.GITHUB_TOKEN || '';
    this.username = process.env.GITHUB_USERNAME || '';
    this.profilePath = path.join(__dirname, '..', 'data', 'profile.json');

    if (!this.apiToken) {
      throw new Error('GITHUB_TOKEN not found in environment variables');
    }

    if (!this.username) {
      throw new Error('GITHUB_USERNAME not found in environment variables');
    }
  }

  private async makeRequest<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`🔍 Fetching: ${endpoint}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'autorriculum-github-collector'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private async getUserData(): Promise<GitHubUser> {
    return this.makeRequest<GitHubUser>(`/users/${this.username}`);
  }

  private async getUserRepos(): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const pageRepos = await this.makeRequest<GitHubRepo[]>(
        `/users/${this.username}/repos?page=${page}&per_page=${perPage}&sort=updated&direction=desc`
      );

      if (pageRepos.length === 0) {
        break;
      }

      repos.push(...pageRepos);
      
      if (pageRepos.length < perPage) {
        break;
      }

      page++;
    }

    return repos;
  }

  private async getRepoLanguages(repo: GitHubRepo): Promise<LanguageStats> {
    try {
      return this.makeRequest<LanguageStats>(`/repos/${repo.full_name}/languages`);
    } catch (error) {
      console.warn(`⚠️  Could not fetch languages for ${repo.name}: ${error}`);
      return {};
    }
  }

  private async analyzeRepositories(repos: GitHubRepo[]): Promise<{
    languageStats: LanguageStats;
    notableRepos: Array<{
      name: string;
      description: string;
      language: string;
      stars: number;
      forks: number;
      url: string;
      topics: string[];
    }>;
    totalStats: {
      stars: number;
      forks: number;
    };
  }> {
    const languageStats: LanguageStats = {};
    const notableRepos: Array<{
      name: string;
      description: string;
      language: string;
      stars: number;
      forks: number;
      url: string;
      topics: string[];
    }> = [];
    let totalStats = { stars: 0, forks: 0 };

    // Filter out forks and focus on original repositories
    const originalRepos = repos.filter(repo => !repo.fork && !repo.archived);

    console.log(`📊 Analyzing ${originalRepos.length} original repositories...`);

    for (const repo of originalRepos) {
      // Accumulate total stats
      totalStats.stars += repo.stargazers_count;
      totalStats.forks += repo.forks_count;

      // Get detailed language stats for each repo
      const repoLanguages = await this.getRepoLanguages(repo);
      
      // Accumulate language statistics
      for (const [language, bytes] of Object.entries(repoLanguages)) {
        languageStats[language] = (languageStats[language] || 0) + bytes;
      }

      // Consider repo notable if it has stars, forks, or interesting topics
      const isNotable = repo.stargazers_count > 0 || 
                       repo.forks_count > 0 || 
                       repo.topics.length > 0 ||
                       (repo.description && repo.description.length > 10);

      if (isNotable) {
        notableRepos.push({
          name: repo.name,
          description: repo.description || 'No description available',
          language: repo.language || 'Unknown',
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          url: repo.html_url,
          topics: repo.topics
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Sort notable repos by stars + forks
    notableRepos.sort((a, b) => (b.stars + b.forks) - (a.stars + a.forks));

    return { languageStats, notableRepos, totalStats };
  }

  private getMostUsedLanguages(languageStats: LanguageStats, limit: number = 10): string[] {
    return Object.entries(languageStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([language]) => language);
  }

  private loadExistingProfile(): ProfileData {
    try {
      const profileContent = fs.readFileSync(this.profilePath, 'utf-8');
      return JSON.parse(profileContent);
    } catch (error) {
      console.warn('⚠️  Could not load existing profile, creating new one');
      return {
        contact: [],
        facts: [],
        projects: {},
        languages: [],
        certifications: {},
        superior_education: {},
        professional_experience: {},
        academical_research: {}
      };
    }
  }

  private enhanceProfileWithGitHubData(
    profile: ProfileData, 
    userData: GitHubUser, 
    repoAnalysis: any
  ): ProfileData {
    // Update basic info if not present
    if (!profile.name && userData.name) {
      profile.name = userData.name;
    }

    // Add GitHub URL to contacts if not present
    const githubUrl = `https://github.com/${this.username}`;
    if (!profile.contact.includes(githubUrl)) {
      profile.contact.push(githubUrl);
    }

    // Add blog/website if available
    if (userData.blog && !profile.contact.includes(userData.blog)) {
      profile.contact.push(userData.blog);
    }

    // Add GitHub stats
    profile.github_stats = {
      total_repos: userData.public_repos,
      total_stars: repoAnalysis.totalStats.stars,
      total_forks: repoAnalysis.totalStats.forks,
      followers: userData.followers,
      following: userData.following,
      account_created: userData.created_at,
      most_used_languages: this.getMostUsedLanguages(repoAnalysis.languageStats),
      notable_repos: repoAnalysis.notableRepos.slice(0, 10) // Top 10 notable repos
    };

    // Enhance programming languages in technical skills
    if (!profile.technical_skills) {
      profile.technical_skills = {
        operating_systems: [],
        programming_languages: [],
        areas_of_expertise: []
      };
    }

    // Add languages from GitHub stats
    const topLanguages = this.getMostUsedLanguages(repoAnalysis.languageStats, 5);
    for (const language of topLanguages) {
      if (!profile.technical_skills.programming_languages.includes(language)) {
        profile.technical_skills.programming_languages.push(language);
      }
    }

    // Add new facts based on GitHub data
    const newFacts: string[] = [];
    
    if (repoAnalysis.totalStats.stars > 0) {
      newFacts.push(`${repoAnalysis.totalStats.stars} stars em repositórios GitHub`);
    }
    
    if (userData.followers > 10) {
      newFacts.push(`${userData.followers} seguidores no GitHub`);
    }

    if (userData.public_repos > 5) {
      newFacts.push(`${userData.public_repos} repositórios públicos no GitHub`);
    }

    // Add notable repositories as projects
    for (const repo of repoAnalysis.notableRepos.slice(0, 5)) {
      if (repo.stars > 0 || repo.forks > 0 || repo.topics.length > 0) {
        const projectKey = repo.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        if (!profile.projects[projectKey]) {
          profile.projects[projectKey] = {
            type: 'open_source_project',
            platform: 'GitHub',
            language: repo.language,
            url: repo.url,
            description: repo.description,
            stars: repo.stars,
            forks: repo.forks,
            topics: repo.topics,
            status: 'published'
          };
        }
      }
    }

    // Add unique facts
    for (const fact of newFacts) {
      if (!profile.facts.includes(fact)) {
        profile.facts.push(fact);
      }
    }

    return profile;
  }

  public async collectAndUpdateProfile(): Promise<void> {
    try {
      console.log('🚀 Starting GitHub data collection...');
      
      // Load existing profile
      const existingProfile = this.loadExistingProfile();
      
      // Fetch GitHub data
      console.log('👤 Fetching user data...');
      const userData = await this.getUserData();
      
      console.log('📁 Fetching repositories...');
      const repos = await this.getUserRepos();
      
      console.log(`📊 Found ${repos.length} repositories. Analyzing...`);
      const repoAnalysis = await this.analyzeRepositories(repos);
      
      // Enhance profile with GitHub data
      console.log('🔧 Enhancing profile with GitHub data...');
      const enhancedProfile = this.enhanceProfileWithGitHubData(
        existingProfile, 
        userData, 
        repoAnalysis
      );
      
      // Save enhanced profile
      const backupPath = `${this.profilePath}.backup.${Date.now()}`;
      if (fs.existsSync(this.profilePath)) {
        fs.copyFileSync(this.profilePath, backupPath);
        console.log(`💾 Backup created: ${backupPath}`);
      }
      
      fs.writeFileSync(this.profilePath, JSON.stringify(enhancedProfile, null, 2));
      
      console.log('✅ Profile successfully updated with GitHub data!');
      console.log(`📈 Stats summary:`);
      console.log(`   - Repositories: ${userData.public_repos}`);
      console.log(`   - Total stars: ${repoAnalysis.totalStats.stars}`);
      console.log(`   - Total forks: ${repoAnalysis.totalStats.forks}`);
      console.log(`   - Followers: ${userData.followers}`);
      console.log(`   - Top languages: ${this.getMostUsedLanguages(repoAnalysis.languageStats, 3).join(', ')}`);
      console.log(`   - Notable repos: ${repoAnalysis.notableRepos.length}`);
      
    } catch (error) {
      console.error('❌ Error collecting GitHub data:', error);
      throw error;
    }
  }
}

async function main() {
  try {
    const collector = new GitHubDataCollector();
    await collector.collectAndUpdateProfile();
  } catch (error) {
    console.error('Failed to collect GitHub data:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { GitHubDataCollector };
