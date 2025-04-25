require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8000;
const MONGO_URI =
  "mongodb+srv://sunilkumawat2244:practise2@cluster0.kr5bn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Connect to MongoDB Atlas
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Define Mongoose Schemas
const UserSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  houseNo: String,
  street: String,
  city: String,
  state: String,
  pincode: String,
  country: String,
  phone: String,
});

const ProductSchema = new mongoose.Schema({
  img: String,
  name: String,
  price: Number,
  desc: String,
  category: String,
  rating: Number,
});

const CartSchema = new mongoose.Schema({
  user_id: mongoose.Schema.Types.ObjectId,
  product_id: mongoose.Schema.Types.ObjectId,
  quantity: Number,
});

const User = mongoose.model("User", UserSchema);
const Product = mongoose.model("Product", ProductSchema);
const Cart = mongoose.model("Cart", CartSchema);

// ✅ Register User
app.post("/register", async (req, res) => {
  const { username, email, password, confirmPassword, houseNo, street, city, state, pincode, country, phone } = req.body;
  if (!username || !email || !password || !confirmPassword || !houseNo || !street || !city || !state || !pincode || !country || !phone)
    return res.status(400).json({ msg: "Please fill in all fields" });
  if (password !== confirmPassword)
    return res.status(400).json({ msg: "Passwords do not match" });
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(409).json({ msg: "Email already registered" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await new User({ username, email, password: hashedPassword, houseNo, street, city, state, pincode, country, phone }).save();
    res.status(201).json({ msg: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ msg: "Error registering user" });
  }
});

// ✅ Login User
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ msg: "Please fill in all fields" });

  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ msg: "Invalid credentials" });

    const token = jwt.sign(
      { user: { id: user._id.toString(), username: user.username, email: user.email } },
      "your_secret_key",
      { expiresIn: "1h" } // Set token expiration
    );

    res.json({
      login: true,
      msg: "Login successful",
      user: { id: user._id.toString(), username: user.username, email: user.email },
      token,
    });
  } catch (error) {
    res.status(500).json({ msg: "Database error while checking email" });
  }
});

// ✅ Get Products
app.get("/products", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Error fetching products" });
  }
});

// ✅ Add to Cart user
app.post("/cart/:userId", async (req, res) => {
  try {
    const userId = mongoose.Types.ObjectId.createFromHexString(
      req.params.userId
    );
    const { productId, quantity } = req.body;

    if (!productId || !quantity) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const productObjectId =
      mongoose.Types.ObjectId.createFromHexString(productId);
    const existingCartItem = await Cart.findOne({
      user_id: userId,
      product_id: productObjectId,
    });
    if (existingCartItem) {
      existingCartItem.quantity += Number(quantity);
      await existingCartItem.save();
    } else {
      await new Cart({
        user_id: userId,
        product_id: productObjectId,
        quantity: Number(quantity),
      }).save();
    }
    res.status(200).json({ message: "Cart updated successfully!" });
  } catch (error) {
    console.error("Error in Add to Cart:", error);
    res.status(500).json({ message: "Error updating cart" });
  }
});

// ✅ Get Cart Items
app.get("/cart/:userId", async (req, res) => {
  const userId = req.params.userId;
  if (!userId) return res.status(400).json({ message: "Missing User Id" });

  try {
    const cartItems = await Cart.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId), // Ensure conversion
        },
      },
      {
        $lookup: {
          from: "products", // Ensure the collection name is correct
          localField: "product_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" }, // Unwrap the product array
      {
        $project: {
          _id: 1,
          quantity: 1,
          "product.name": 1,
          "product.price": 1,
          "product.img": 1,
        },
      },
    ]);
    if (cartItems.length === 0) {
      return res.status(404).json({ message: "Cart is empty" });
    }
    res.status(200).json(cartItems);
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ message: "Error fetching cart" });
  }
});

// ✅ Remove from Cart
app.delete("/cart/:userId/:cartItemId", async (req, res) => {
  try {
    const { cartItemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(cartItemId)) {
      return res.status(400).json({ message: "Invalid Cart Item ID" });
    }
    await Cart.deleteOne({ _id: cartItemId });
    return res.status(200).json({ message: "Item removed from cart" });
  } catch (error) {
    console.error("Error removing item from cart:", error);
    return res.status(500).json({ message: "Error removing from cart" });
  }
});

// incrienet decriment functionlity cart
app.put("/cart/:userId/increment/:cartItemId", async (req, res) => {
  try {
    const { cartItemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(cartItemId)) {
      return res.status(400).json({ message: "Invalid Cart Item ID" });
    }

    const cartItem = await Cart.findById(cartItemId);
    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    cartItem.quantity += 1;
    await cartItem.save();
    return res
      .status(200)
      .json({ message: "Item quantity incremented", cartItem });
  } catch (error) {
    console.error("Error incrementing item quantity:", error);
    return res
      .status(500)
      .json({ message: "Error incrementing item quantity" });
  }
});

app.put("/cart/:userId/decrement/:cartItemId", async (req, res) => {
  try {
    const { cartItemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(cartItemId)) {
      return res.status(400).json({ message: "Invalid Cart Item ID" });
    }
    const cartItem = await Cart.findById(cartItemId);
    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }
    if (cartItem.quantity <= 1) {
      return res
        .status(400)
        .json({ message: "Quantity cannot be less than 1" });
    }

    cartItem.quantity -= 1;
    await cartItem.save();
    return res
      .status(200)
      .json({ message: "Item quantity decremented", cartItem });
  } catch (error) {
    console.error("Error decrementing item quantity:", error);
    return res
      .status(500)
      .json({ message: "Error decrementing item quantity" });
  }
});

// ✅ Clear Cart
app.delete("/cart/:userId", async (req, res) => {
  const userId = req.params.userId;
  if (!userId) return res.status(400).json({ message: "Missing User Id" });
  try {
    await Cart.deleteMany({ user_id: userId });
    res.status(200).json({ message: "Cart cleared" });
  } catch (error) {
    res.status(500).json({ message: "Error clearing cart" });
  }
});

// ✅ Get User Profile My Profile View
app.get("/myprofile/:userId", async (req, res) => {
  const userId = req.params.userId;
  if (!userId) return res.status(400).json({ message: "User ID is required" });
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Error fetching profile" });
  }
});

// =====================

// %%%%%%%%%%%%%%%%
// ADMIN FUNCTIONALITY
// %%%%%%%%%%%%%%%%

// =====================

// ✅ Admin Login
const adminCredentials = {
  username: "admin",
  password: "admin123",
};
app.post("/adminlogin", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).send({ message: "Please fill in all fields" });
  if (
    username !== adminCredentials.username ||
    password !== adminCredentials.password
  )
    return res.status(401).send({ message: "Invalid credentials" });
  const token = jwt.sign({ username }, "your_secret_key", { expiresIn: "1h" });
  res.send({
    login: true,
    message: "Login successful",
    user: { username },
    token,
  });
});

// ✅ Admin Authentication Check
app.get("/isAuth", (req, res) => {
  const token = req.headers["x-access-token"];
  if (!token) return res.status(403).send({ message: "No token provided" });
  jwt.verify(token, "your_secret_key", (err, decoded) => {
    if (err) return res.status(401).send({ message: "Unauthorized" });
    res.send({ login: true, user: decoded });
  });
});

// ✅ Admin: Get All Users Dashboard
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).send("Database query failed");
  }
});

// ✅ Admin: Delete User
app.delete("/api/usersdelet/:id", async (req, res) => {
  const userId = req.params.id;
  if (!userId) return res.status(400).json({ message: "Missing User Id" });
  try {
    await Cart.deleteMany({ user_id: userId });
    await User.findByIdAndDelete(userId);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).send("Failed to delete user");
  }
});

// ✅ Admin: Update User
app.put("/api/usersupdate/:id", async (req, res) => {
  const { username, email } = req.body;
  const userId = req.params.id;
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { username, email },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found." });
    res.status(200).json({ message: "User updated successfully." });
  } catch (error) {
    res.status(500).json({ error: "Database query failed." });
  }
});

// ✅ Admin: Get User Details specific user
app.get("/api/usersshowdetails/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).send("User not found");
    res.json(user);
  } catch (error) {
    res.status(500).send("Database query failed");
  }
});

// ✅ Admin: Get User Cart Details
app.get("/api/usercartdetails/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const cartItems = await Cart.find({ user_id: id });
    res.json(cartItems);
  } catch (error) {
    res.status(500).send("Cart Data query failed");
  }
});

// ✅ Admin: Get User Product Details
app.get("/api/userproductdetails/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).send("Product not found");
    res.json(product);
  } catch (error) {
    res.status(500).send("Product Data query failed");
  }
});

// ===================== ADD ITEMS TO DASHBOARD =====================
// ✅ Admin: Add New Product
// ✅ Admin: Get All Products
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Admin: Add New Product
app.post("/api/productsadd", async (req, res) => {
  try {
    console.log("Received data:", req.body); // Check what data is being received
    const { img, name, price, desc, category, rating } = req.body;
    if (!img || !name) {
      return res.status(400).json({ error: "Image and Name are required!" });
    }
    const newProduct = new Product({
      img,
      name,
      price: price ? Number(price) : 0,
      desc,
      category,
      rating: rating ? Number(rating) : 0,
    });
    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (error) {
    console.error("Error saving product:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Admin: Update Product
app.put("/api/products/:id", async (req, res) => {
  const { name, price, desc, category, rating, img } = req.body;
  const { id } = req.params;
  try {
    // Ensure ID format is correct
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { name, price, desc, category, rating, img },
      { new: true, runValidators: true }
    );
    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({
      message: "Product updated successfully!",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
// // retrive image
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find(); // Fetch all products
    res.json(products); // Send response
    // console.log(products)
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Product.findByIdAndDelete(id);
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// ✅ Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
