const Skill = require('../models/Skill');
const { createAdminUser } = require('./createAdminUser');

const defaultSkills = [
  // Programming Languages
  { name: 'JavaScript', category: 'Programming' },
  { name: 'Python', category: 'Programming' },
  { name: 'Java', category: 'Programming' },
  { name: 'PHP', category: 'Programming' },
  { name: 'C++', category: 'Programming' },
  { name: 'C#', category: 'Programming' },
  { name: 'Ruby', category: 'Programming' },
  { name: 'Go', category: 'Programming' },
  { name: 'TypeScript', category: 'Programming' },
  { name: 'Swift', category: 'Programming' },
  { name: 'Kotlin', category: 'Programming' },
  { name: 'Rust', category: 'Programming' },

  // Frontend Development
  { name: 'React', category: 'Frontend' },
  { name: 'Vue.js', category: 'Frontend' },
  { name: 'Angular', category: 'Frontend' },
  { name: 'HTML', category: 'Frontend' },
  { name: 'CSS', category: 'Frontend' },
  { name: 'Sass', category: 'Frontend' },
  { name: 'Tailwind CSS', category: 'Frontend' },
  { name: 'Bootstrap', category: 'Frontend' },
  { name: 'jQuery', category: 'Frontend' },

  // Backend Development
  { name: 'Node.js', category: 'Backend' },
  { name: 'Express.js', category: 'Backend' },
  { name: 'Django', category: 'Backend' },
  { name: 'Flask', category: 'Backend' },
  { name: 'Rails', category: 'Backend' },
  { name: 'Spring Boot', category: 'Backend' },
  { name: 'Laravel', category: 'Backend' },
  { name: 'ASP.NET', category: 'Backend' },

  // Databases
  { name: 'MySQL', category: 'Database' },
  { name: 'PostgreSQL', category: 'Database' },
  { name: 'MongoDB', category: 'Database' },
  { name: 'Redis', category: 'Database' },
  { name: 'SQLite', category: 'Database' },
  { name: 'Oracle', category: 'Database' },
  { name: 'SQL Server', category: 'Database' },

  // Cloud & DevOps
  { name: 'AWS', category: 'Cloud' },
  { name: 'Google Cloud', category: 'Cloud' },
  { name: 'Azure', category: 'Cloud' },
  { name: 'Docker', category: 'DevOps' },
  { name: 'Kubernetes', category: 'DevOps' },
  { name: 'Jenkins', category: 'DevOps' },
  { name: 'GitLab CI', category: 'DevOps' },
  { name: 'GitHub Actions', category: 'DevOps' },

  // Mobile Development
  { name: 'React Native', category: 'Mobile' },
  { name: 'Flutter', category: 'Mobile' },
  { name: 'iOS Development', category: 'Mobile' },
  { name: 'Android Development', category: 'Mobile' },

  // Design
  { name: 'UI/UX Design', category: 'Design' },
  { name: 'Figma', category: 'Design' },
  { name: 'Adobe Photoshop', category: 'Design' },
  { name: 'Adobe Illustrator', category: 'Design' },
  { name: 'Sketch', category: 'Design' },

  // Data Science & AI
  { name: 'Machine Learning', category: 'AI/ML' },
  { name: 'Data Science', category: 'AI/ML' },
  { name: 'TensorFlow', category: 'AI/ML' },
  { name: 'PyTorch', category: 'AI/ML' },
  { name: 'Pandas', category: 'AI/ML' },
  { name: 'NumPy', category: 'AI/ML' },

  // Project Management
  { name: 'Project Management', category: 'Management' },
  { name: 'Agile', category: 'Management' },
  { name: 'Scrum', category: 'Management' },
  { name: 'Kanban', category: 'Management' },

  // Marketing & Business
  { name: 'Digital Marketing', category: 'Marketing' },
  { name: 'SEO', category: 'Marketing' },
  { name: 'Social Media Marketing', category: 'Marketing' },
  { name: 'Content Marketing', category: 'Marketing' },
  { name: 'Email Marketing', category: 'Marketing' },
  { name: 'Business Analysis', category: 'Business' },
  { name: 'Sales', category: 'Business' },

  // Writing & Content
  { name: 'Content Writing', category: 'Writing' },
  { name: 'Technical Writing', category: 'Writing' },
  { name: 'Copywriting', category: 'Writing' },
  { name: 'Blog Writing', category: 'Writing' },
  { name: 'Translation', category: 'Writing' }
];

const seedDatabase = async () => {
  try {
    console.log('Starting database seeding...');

    // Create admin user
    console.log('Creating admin user...');
    await createAdminUser();

    // Seed skills
    console.log('Seeding skills...');
    const createdSkillIds = await Skill.bulkCreate(defaultSkills);
    console.log(`Created ${createdSkillIds.length} new skills`);

    console.log('Database seeding completed successfully!');
    
    return {
      adminCreated: true,
      skillsCreated: createdSkillIds.length
    };
  } catch (error) {
    console.error('Database seeding failed:', error);
    throw error;
  }
};

// If this file is run directly
if (require.main === module) {
  const { createTables } = require('../config/database');
  
  (async () => {
    try {
      console.log('Creating database tables...');
      await createTables();
      
      await seedDatabase();
      
      process.exit(0);
    } catch (error) {
      console.error('Seeding process failed:', error);
      process.exit(1);
    }
  })();
}

module.exports = { seedDatabase, defaultSkills };