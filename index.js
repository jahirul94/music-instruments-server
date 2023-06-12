const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const app = express();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware 
app.use(cors())
app.use(express.json())

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.SECURE_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}


app.get("/", (req, res) => {
    res.send("Music instrument server is running")
})
// mongo start 

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const req = require('express/lib/request');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kri1sc7.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const classesCollection = client.db("musicInstrument").collection("classes");
const usersCollection = client.db("musicInstrument").collection("users");
const enrolledCollection = client.db("musicInstrument").collection("enrolled");
const feedbackCollection = client.db("musicInstrument").collection("feedback");
const paymentsCollection = client.db("musicInstrument").collection("payments");
const popularInstructorsCollection = client.db("musicInstrument").collection("popularInstructors");


async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        //   json web token 
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.SECURE_TOKEN, { expiresIn: '1h' })

            res.send({ token })
        })
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }

        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }
        const verifyStudent = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'regular') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }
        // admin dashboard
        app.get('/AllClasses', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result)
        })

        app.patch('/adminAction/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const action = req.query.action;
            const filter = { _id: new ObjectId(id) };
            if (action === "approve") {
                const updateDoc = {
                    $set: {
                        status: 'approved'
                    },
                };
                const result = await classesCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else if (action === "deny") {
                const updateDoc = {
                    $set: {
                        status: 'denied'
                    },
                };
                const result = await classesCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
        })
        // feedback
        app.post("/feedback", verifyJWT, verifyAdmin, async (req, res) => {
            const feedback = req.body.feedback;
            const itemId = feedback.itemId;
            const message = feedback.feedback;
            const checked = await feedbackCollection.findOne({ itemId: itemId });
            if (checked) {
                const query = { itemId: itemId }
                const updateDoc = {
                    $set: {
                        feedback: message,
                    },
                };
                const result = await feedbackCollection.updateOne(query, updateDoc)
                res.send(result);
            }
            else {
                const result = await feedbackCollection.insertOne(feedback)
                res.send(result)
            }
        })
//   github problem
        app.get("/feedback", verifyJWT, verifyStudent , async (req, res) => {
            const result = await feedbackCollection.find().toArray();
            res.send(result)
        })
        //  instructor dashboard
        app.get('/instructors', async (req, res) => {
            const query = { role: 'instructor' }
            const result = await usersCollection.find(query).toArray();
            res.send(result)
        })
        app.post("/instructors", verifyJWT, verifyInstructor, async (req, res) => {
            const data = req.body;
            const result = await classesCollection.insertOne(data);
            res.send(result)
        })
        app.get('/instructorClass', verifyJWT , verifyInstructor , async (req, res) => {
            const email = req.query?.email;
            const query = { instructorEmail: email }
            const result = await classesCollection.find(query).toArray();
            res.send(result)
        })

        // all approved classes 
        app.get('/displayclasses', async (req, res) => {
            const query = { status: "approved" }
            const result = await classesCollection.find(query).toArray();
            res.send(result)
        })
        // <----------------------------------------------------------->
        app.get("/popularClasses", async (req, res) => {
            const result = await classesCollection.find().sort({ sell: -1 }).limit(6).toArray();
            res.send(result)
        })

        app.get("/popularInstructors", async (req, res) => {
            const result = await popularInstructorsCollection.find().sort({ classSell: -1 }).toArray();
            const query = { email: { $in: result?.map(user => user.instructorsEmail) } }
            const result2 = await usersCollection.find(query).limit(6).toArray();
            res.send(result2)
        })

        //  -------------------------------------------------------------
        // students dashboard 
        app.get('/studentClasses',verifyJWT , verifyStudent , async (req, res) => {
            const email = req.query?.email;
            const query = { email: email }
            const result = await enrolledCollection.find(query).toArray();
            res.send(result)
        })
        app.delete("/studentClasses/:id", verifyJWT , verifyStudent , async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await enrolledCollection.deleteOne(query);
            res.send(result)
        })

        app.post("/classes", verifyJWT , verifyStudent , async (req, res) => {
            const data = req.body;
            const itemId = data.itemId;
            const checkAvailable = await enrolledCollection.findOne({ itemId: itemId })
            if (checkAvailable) {
                return res.send({ message: "This Class already Added on Cart" })
            }
            const result = await enrolledCollection.insertOne(data);
            res.send(result)
        })
        // 
        // for make admin 
        app.patch('/action/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const action = req.query.action;
            const filter = { _id: new ObjectId(id) };
            if (action === "makeAdmin") {
                const updateDoc = {
                    $set: {
                        role: 'admin'
                    },
                };
                const result = await usersCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else if (action === "makeInstructor") {
                const updateDoc = {
                    $set: {
                        role: 'instructor'
                    },
                };
                const result = await usersCollection.updateOne(filter, updateDoc);
                res.send(result);
            }


        })

        //    for manage allUsers
        app.get('/allUsers', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.get('/users', verifyJWT, verifyAdmin , async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });
        //   end 

        //   use admin , instructor and student hooks 
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })

        app.get('/users/instructors/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result);
        })
        // TODO : make it students route
        app.get('/users/students/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ student: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { student: user?.role === 'regular' }
            res.send(result);
        })

        // payment intent
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"]
            })
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })

        //   cart items 
        app.post('/savePaymentInfo', verifyJWT, async (req, res) => {
            const savedDoc = req.body;
            const result = await paymentsCollection.insertOne(savedDoc);
            const query = { itemId: savedDoc.itemId }
            const deletedCart = await enrolledCollection.deleteOne(query);
            // update class sell and seat 
            const updateQuery = { _id: new ObjectId(savedDoc.itemId) }
            const findDoc = await classesCollection.findOne(updateQuery);
            const updateDoc = {
                $set: {
                    sell: findDoc.sell + 1,
                    availableSeats: parseInt(findDoc.availableSeats) - 1,
                },
            };
            const updateData = await classesCollection.updateOne(updateQuery, updateDoc)
            res.send({ result, deletedCart, updateData })
        })

        app.get("/savePaymentInfo", verifyJWT, async (req, res) => {
            const email = req.query?.email;
            const query = { email: email };
            const result = await paymentsCollection.find(query).toArray();
            res.send(result)
        })

        // make popular instructors 
        app.post("/updateInstructors", verifyJWT , async (req, res) => {
            const savedInstructors = req.body;
            const query = { instructorsEmail: savedInstructors.instructorEmail }
            const isAvailable = await popularInstructorsCollection.findOne(query);
            if (!isAvailable) {
                const pInstructorsDoc = {
                    instructorsEmail: savedInstructors.instructorEmail,
                    classSell: 1,
                }
                const result = await popularInstructorsCollection.insertOne(pInstructorsDoc);
                res.send(result);
            }
            else {
                const pInstructorsDoc = {
                    $set: {
                        classSell: isAvailable.classSell + 1,
                    },
                }
                const result = await popularInstructorsCollection.updateOne(query, pInstructorsDoc)
                res.send(result);

            }
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

// mongo end



app.listen(port, () => {
    console.log(`Music server is Running on port ${port}`);
})













            // // update instructors sells class
            // const filter = { instructorsEmail: savedDoc.instructorEmail }
            // const options = { upsert: true };
            // const pInstructorsDoc = {
            //     instructorsEmail: savedDoc.instructorEmail,
            //     classSell: 1,
            // }
            // const result3 = await popularInstructorsCollection.updateOne(filter, pInstructorsDoc , options)