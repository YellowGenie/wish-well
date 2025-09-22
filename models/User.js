const { mongoose } = require('../config/mongodb');
const bcrypt = require('bcryptjs');

// Import DeletedUser model at the bottom to avoid circular dependency
let DeletedUser;

// User Schema
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['talent', 'manager', 'admin'],
    required: true
  },
  first_name: {
    type: String,
    trim: true
  },
  last_name: {
    type: String,
    trim: true
  },
  profile_image: {
    type: String
  },
  is_active: {
    type: Boolean,
    default: true
  },
  email_verified: {
    type: Boolean,
    default: false
  },
  profile_completion_modal_dismissed_at: {
    type: Date,
    default: null
  },
  hide_profile_completion_modal: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to validate password
userSchema.methods.validatePassword = async function(inputPassword) {
  return await bcrypt.compare(inputPassword, this.password);
};

// Static methods
userSchema.statics.create = async function({ email, password, role, first_name, last_name }) {
  const user = new this({ email, password, role, first_name, last_name });
  const savedUser = await user.save();
  return savedUser._id;
};

userSchema.statics.findByEmail = async function(email) {
  return await this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findById = async function(id) {
  return await this.findOne({ _id: id }).select('email role first_name last_name profile_image is_active email_verified created_at');
};

userSchema.statics.updateProfile = async function(id, updates) {
  const result = await this.updateOne({ _id: id }, { $set: updates });
  return result.modifiedCount > 0;
};

userSchema.statics.validatePassword = async function(inputPassword, hashedPassword) {
  return await bcrypt.compare(inputPassword, hashedPassword);
};

userSchema.statics.getAllUsers = async function(role = null, page = 1, limit = 20) {
  try {
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 1000);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;
    
    let query = {};
    
    if (role && role !== 'all' && role !== null && role !== '') {
      query.role = role;
    }
    
    console.log('Executing getAllUsers query with filter:', query);
    
    const users = await this.find(query)
      .select('email role first_name last_name profile_image is_active email_verified created_at updated_at')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parsedLimit);
    
    console.log(`Found ${users.length} users`);
    
    const total = await this.countDocuments(query);
    
    return {
      users: users.map(user => ({
        ...user.toObject(),
        id: user._id,
        is_verified: user.email_verified
      })),
      total: total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    };
  } catch (error) {
    console.error('getAllUsers error:', error);
    throw error;
  }
};

userSchema.statics.deactivateUser = async function(id) {
  const result = await this.updateOne({ _id: id }, { $set: { is_active: false } });
  return result.modifiedCount > 0;
};

userSchema.statics.softDeleteUser = async function(id, deletedBy, reason = null) {
  const session = await mongoose.startSession();
  let transactionCommitted = false;
  
  try {
    await session.startTransaction();

    // Get user data before deletion
    const user = await this.findById(id, null, { session });
    
    if (!user) {
      await session.abortTransaction();
      transactionCommitted = true; // Mark as handled
      return { success: false, error: 'User not found' };
    }

    // Get profile data based on user role
    let profileData = null;
    if (user.role === 'talent') {
      const TalentProfile = mongoose.model('TalentProfile');
      profileData = await TalentProfile.findOne({ user_id: id }, null, { session });
    } else if (user.role === 'manager') {
      const ManagerProfile = mongoose.model('ManagerProfile');
      profileData = await ManagerProfile.findOne({ user_id: id }, null, { session });
    }

    // Insert into deleted_users collection
    if (!DeletedUser) {
      DeletedUser = require('./DeletedUser');
    }
    await DeletedUser.create([{
      original_user_id: user._id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      profile_image: user.profile_image,
      user_data: user.toObject(),
      profile_data: profileData ? profileData.toObject() : null,
      deletion_reason: reason,
      deleted_by: deletedBy,
      original_created_at: user.created_at
    }], { session });

    // Delete the user
    const deleteResult = await this.deleteOne({ _id: id }, { session });

    await session.commitTransaction();
    transactionCommitted = true;
    
    return { 
      success: true, 
      affectedRows: deleteResult.deletedCount,
      deletedUser: {
        id: user._id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      }
    };
  } catch (error) {
    if (!transactionCommitted) {
      await session.abortTransaction();
    }
    console.error('Soft delete user error:', error);
    return { success: false, error: error.message };
  } finally {
    await session.endSession();
  }
};

userSchema.statics.hardDeleteUser = async function(id) {
  try {
    // Get user info for return data
    const user = await this.findById(id).select('_id email first_name last_name');
    
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Hard delete
    const result = await this.deleteOne({ _id: id });
    
    return { 
      success: true, 
      affectedRows: result.deletedCount,
      deletedUser: {
        id: user._id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      }
    };
  } catch (error) {
    console.error('Hard delete user error:', error);
    return { success: false, error: error.message };
  }
};

userSchema.statics.getDeletedUsers = async function(page = 1, limit = 20) {
  try {
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;
    
    const DeletedUser = mongoose.model('DeletedUser');
    const deletedUsers = await DeletedUser.find()
      .populate('deleted_by', 'first_name last_name')
      .sort({ deleted_at: -1 })
      .skip(skip)
      .limit(parsedLimit);
    
    const total = await DeletedUser.countDocuments();
    
    return {
      deletedUsers: deletedUsers.map(user => ({
        ...user.toObject(),
        deleted_by_name: user.deleted_by?.first_name,
        deleted_by_last_name: user.deleted_by?.last_name
      })),
      total: total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    };
  } catch (error) {
    console.error('Get deleted users error:', error);
    throw error;
  }
};

userSchema.statics.restoreUser = async function(deletedUserId, restoredBy) {
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();

    // Get deleted user data
    const DeletedUser = mongoose.model('DeletedUser');
    const deletedUser = await DeletedUser.findById(deletedUserId).session(session);
    
    if (!deletedUser) {
      await session.abortTransaction();
      return { success: false, error: 'Deleted user not found' };
    }

    const userData = deletedUser.user_data;
    const profileData = deletedUser.profile_data;

    // Check if email already exists
    const existingUser = await this.findOne({ email: deletedUser.email }).session(session);
    
    if (existingUser) {
      await session.abortTransaction();
      return { success: false, error: 'Email already exists in active users' };
    }

    // Restore user
    const restoredUser = await this.create([{
      email: userData.email,
      password: userData.password,
      role: userData.role,
      first_name: userData.first_name,
      last_name: userData.last_name,
      profile_image: userData.profile_image,
      is_active: userData.is_active,
      email_verified: userData.email_verified,
      created_at: userData.created_at
    }], { session });

    const newUserId = restoredUser[0]._id;

    // Restore profile data if exists
    if (profileData) {
      if (userData.role === 'talent') {
        const TalentProfile = mongoose.model('TalentProfile');
        await TalentProfile.create([{
          user_id: newUserId,
          title: profileData.title || '',
          bio: profileData.bio || '',
          hourly_rate: profileData.hourly_rate,
          availability: profileData.availability || 'contract',
          location: profileData.location || '',
          portfolio_description: profileData.portfolio_description || '',
          created_at: profileData.created_at,
          updated_at: profileData.updated_at
        }], { session });
      } else if (userData.role === 'manager') {
        const ManagerProfile = mongoose.model('ManagerProfile');
        await ManagerProfile.create([{
          user_id: newUserId,
          company_name: profileData.company_name || '',
          company_description: profileData.company_description || '',
          company_size: profileData.company_size,
          industry: profileData.industry || '',
          location: profileData.location || '',
          created_at: profileData.created_at,
          updated_at: profileData.updated_at
        }], { session });
      }
    }

    // Remove from deleted_users collection
    await DeletedUser.deleteOne({ _id: deletedUserId }).session(session);

    await session.commitTransaction();
    
    return { 
      success: true, 
      restoredUser: {
        id: newUserId,
        email: userData.email,
        name: `${userData.first_name} ${userData.last_name}`,
        role: userData.role
      }
    };
  } catch (error) {
    await session.abortTransaction();
    console.error('Restore user error:', error);
    return { success: false, error: error.message };
  } finally {
    await session.endSession();
  }
};

// Create the User model
const User = mongoose.model('User', userSchema);

module.exports = User;