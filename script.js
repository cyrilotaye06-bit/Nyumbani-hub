// =====================================
// Nyumbani Hub SCRIPT.JS
// =====================================

const API_URL = "http://localhost:3000/api";


// =====================================
// IMAGE PREVIEW
// =====================================

const imageInput =
document.getElementById("image");

const imagePreview =
document.getElementById("imagePreview");

if(imageInput){

imageInput.addEventListener("change", function(){

    const file = this.files[0];

    if(!file) return;

    const reader = new FileReader();

    reader.onload = function(e){

        if(imagePreview){

            imagePreview.src =
            e.target.result;

            imagePreview.style.display =
            "block";

        }

    };

    reader.readAsDataURL(file);

});

}

// =====================================
// ADD PROPERTY
// =====================================

const propertyForm =
document.getElementById("propertyForm");

if(propertyForm){

propertyForm.addEventListener(
"submit",
async function(e){

    e.preventDefault();

    try{

        const formData =
        new FormData();

        formData.append(
            "title",
            document.getElementById("title").value
        );

        formData.append(
            "category",
            document.getElementById("category").value
        );

        formData.append(
            "price",
            document.getElementById("price").value
        );

        formData.append(
            "location",
            document.getElementById("location").value
        );

        formData.append(
            "address",
            document.getElementById("address").value
        );

        formData.append(
            "bedrooms",
            document.getElementById("bedrooms").value
        );

        formData.append(
            "bathrooms",
            document.getElementById("bathrooms").value
        );

        formData.append(
            "parking_spaces",
            document.getElementById("parking").value
        );

        formData.append(
            "property_size",
            document.getElementById("size").value
        );

        formData.append(
            "furnished",
            document.getElementById("furnished").value
        );

        formData.append(
            "availability_date",
            document.getElementById("available").value
        );

        formData.append(
            "description",
            document.getElementById("description").value
        );

        formData.append(
            "agent_id",
            document.getElementById("agent").value
        );

        const image =
        document.getElementById("image")
        .files[0];

        if(image){
            formData.append(
                "image",
                image
            );
        }

        const response =
        await fetch(

            `${API_URL}/properties`,

            {
                method:"POST",
                body:formData
            }

        );

        const data =
        await response.json();

        alert("Property Added");

        propertyForm.reset();

        loadProperties();

        loadStatistics();

    }

    catch(error){

        console.error(error);

    }

});

}

// =====================================
// LOAD PROPERTIES
// =====================================

async function loadProperties(){

try{

const response =
await fetch(
`${API_URL}/properties`
);

const properties =
await response.json();

const container =
document.getElementById(
"propertyList"
);

if(!container) return;

container.innerHTML = "";

properties.forEach(property=>{

container.innerHTML += `

<div class="property-card">

<img
src="${property.image_path ? 'http://localhost:3000' + property.image_path : 'http://localhost:3000/uploads/default.jpg'}"
alt="${property.title}">

<div class="content">

<span class="badge">
${property.category}
</span>

<h3>${property.title}</h3>

<p>
<strong>Location:</strong>
${property.location}
</p>

<p>
<strong>Price:</strong>
KES ${Number(property.price)
.toLocaleString()}
</p>

<p>
${property.bedrooms}
 Beds |
${property.bathrooms}
 Baths
</p>

<p>
Available:
${property.availability_date}
</p>


<button
onclick="editProperty(${property.id})">
Edit
</button>

<button
class="delete-btn"
onclick="deleteProperty(${property.id})">
Delete
</button>

</div>

</div>

`;

});

}

catch(error){

console.error(error);

}

}

// =====================================
// DELETE PROPERTY
// =====================================

async function deleteProperty(id){

const confirmDelete =
confirm(
"Delete this property?"
);

if(!confirmDelete) return;

try{

await fetch(

`${API_URL}/properties/${id}`,

{
method:"DELETE"
}

);

loadProperties();

loadStatistics();

}

catch(error){

console.error(error);

}

}

// =====================================
// EDIT PROPERTY
// =====================================

async function editProperty(id){

try{

const response =
await fetch(
`${API_URL}/properties/${id}`
);

const data =
await response.json();

const property =
data[0];

document.getElementById("title")
.value =
property.title;

document.getElementById("category")
.value =
property.category;

document.getElementById("price")
.value =
property.price;

document.getElementById("location")
.value =
property.location;

document.getElementById("address")
.value =
property.address;

document.getElementById("bedrooms")
.value =
property.bedrooms;

document.getElementById("bathrooms")
.value =
property.bathrooms;

document.getElementById("size")
.value =
property.property_size;

document.getElementById("available")
.value =
property.availability_date;

document.getElementById("description")
.value =
property.description;

window.scrollTo({

top:0,

behavior:"smooth"

});

}

catch(error){

console.error(error);

}

}

// =====================================
// SEARCH
// =====================================

function searchProperties(){

const input =
document.getElementById(
"searchInput"
);

if(!input) return;

const filter =
input.value.toLowerCase();

const cards =
document.querySelectorAll(
".property-card"
);

cards.forEach(card=>{

const text =
card.innerText.toLowerCase();

if(text.includes(filter)){

card.style.display =
"block";

}

else{

card.style.display =
"none";

}

});

}

// =====================================
// CATEGORY FILTER
// =====================================

function filterCategory(category){

const cards =
document.querySelectorAll(
".property-card"
);

cards.forEach(card=>{

const badge =
card.querySelector(
".badge"
).innerText;

if(

category === "All" ||

badge === category

){

card.style.display =
"block";

}

else{

card.style.display =
"none";

}

});

}

// =====================================
// LOAD AGENTS
// =====================================

async function loadAgents(){

try{

const response =
await fetch(
`${API_URL}/agents`
);

const agents =
await response.json();

const select =
document.getElementById(
"agent"
);

if(!select) return;

select.innerHTML = "";

agents.forEach(agent=>{

select.innerHTML += `

<option value="${agent.id}">
${agent.full_name}
</option>

`;

});

}

catch(error){

console.error(error);

}

}

// =====================================
// DASHBOARD STATS
// =====================================

async function loadStatistics(){

try{

const response =
await fetch(
`${API_URL}/properties`
);

const properties =
await response.json();

const rentals =
properties.filter(
p=>p.category==="Rental"
).length;

const sales =
properties.filter(
p=>p.category==="Sale"
).length;

const bnbs =
properties.filter(
p=>p.category==="BnB"
).length;

const resales =
properties.filter(
p=>p.category==="Resale"
).length;

const total =
properties.length;

if(document.getElementById("totalListings"))
document.getElementById(
"totalListings"
).innerText = total;

if(document.getElementById("rentalCount"))
document.getElementById(
"rentalCount"
).innerText = rentals;

if(document.getElementById("saleCount"))
document.getElementById(
"saleCount"
).innerText = sales;

if(document.getElementById("bnbCount"))
document.getElementById(
"bnbCount"
).innerText = bnbs;

if(document.getElementById("resaleCount"))
document.getElementById(
"resaleCount"
).innerText = resales;

}

catch(error){

console.error(error);

}

}

// =====================================
// PAGE LOAD
// =====================================

document.addEventListener(
"DOMContentLoaded",
function(){

loadProperties();

loadAgents();

loadStatistics();

});